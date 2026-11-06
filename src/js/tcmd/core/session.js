// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/session
// A Session wires two panes plus cross-pane UI state (active pane, preview,
// command panel, bookmarks) into one dispatchable model. Everything reactive
// is a cell or derived cell; views subscribe, commands mutate.
//
// On top of the two (source/destination) panes the session owns two auxiliary
// panes: `parent` mirrors the parent of the pane holding the current
// directory, `preview` mirrors the directory the inspector is showing. They
// are real panes — own listing, cursor, marks — so the explorer view and the
// directory preview are clickable and keyboard-navigable like any other pane,
// while path changes still land on the pane that owns the current directory
// (see `currentId` / `core/pane#currentPane`).

import { cell, derived, effect } from "select/state/cells"
import { createBookmarks } from "./bookmarks.js"
import { createJournal } from "./journal.js"
import { createDispatch } from "./commands.js"
import { getCommandBarItems } from "./bar.js"
import { createNullOs } from "./os.js"
import { PANEL_FOCUS, argvFor, bindArgs, filterPanelEntries, isTextualRow, panelCommandLines, panelCommandParts, panelEntries, panelEntryRows, panelRowList, panelRunnable, rowAt, withArgValue } from "./panel.js"
import { createPickerPathQueue, pickerRowList, pickerVisibleEntries } from "./picker.js"
import { basename, parent as parentPath } from "./path.js"
import { hasBinaryByte, PREVIEW_BYTES, previewKind, previewSource } from "./preview.js"
import { compressedBytes, decompressHead } from "./decompress.js"
import { indexOfPath } from "./selection.js"
import { createPane, PANE_BUFFERS } from "./pane.js"
import { hasMatch, score } from "../vendor/fzy.js"

// Constant: BOOKMARK_ADD_KEY
// Key and display label of the synthetic "add current path" row. It contains
// spaces, which a bookmark name may not, so it can never collide with a stored
// row.
const BOOKMARK_ADD_KEY = "+ add current path"

// Function: createSession
// Creates the shared model for a two-pane browser.
//
// Example:
// ```javascript
// const session = createSession({ fs: createNodeFs(), left: pane, right: pane })
// await session.load()
// session.dispatch("pane.toggle")
// ```
function createSession({ fs, os, vcs, left, right, host, bookmarks, viewMode = "explorer", server = false } = {}) {
	const session = {}
	session.fs = fs
	session.os = os ?? createNullOs()
	session.panes = { left, right }
	// Auxiliary panes: the explorer's parent column and the inspector's
	// directory column. Both start on a valid path so a refresh before their
	// first sync can never read a blank one.
	session.panes.parent = createPane({ fs, vcs, path: parentPath(left.path.value) ?? left.path.value })
	session.panes.preview = createPane({ fs, vcs, path: left.path.value })
	// File picker: a private pane the command panel browses while a path
	// argument is being picked. Kept out of `session.panes` so `load`, the
	// pane refresh loop and pane navigation leave it alone; it is (re)read
	// when the picker opens (see `core/commands#openPicker`).
	session.pickerPane = createPane({ fs, vcs, path: left.path.value })
	// Shown in the header title; empty when the environment has no hostname.
	session.host = host ?? ""
	// The running web UI server, or null when stopped: `{ mode, url, token }` where
	// `mode` is "local" (loopback) or "lan" (the machine hostname). The TUI
	// identity bar shows it and clicking it copies the URL; the host installs
	// `toggleServer` (see `tui/server`) because core cannot open a port.
	session.webServer = cell(null)
	session.toggleServer = null
	// The renderer installs its quit hook at mount; the panel's Quit command
	// calls it (core cannot exit a process or unmount a DOM app itself).
	session.quit = null
	// The screenshot queue's tail promise, null when idle. Panel runs return
	// early so the panel can close before capture; scripts await completion
	// inside the operation. Captures serialize name selection and writing.
	session.screenshotPending = null
	// Bookmark model (named paths). The store defaults to in-memory.
	session.bookmarks = bookmarks ?? createBookmarks()
	// Undo/redo journal: reversible file operations (`mkdir`, `copy`, `move`,
	// `rename`, `replace`, `trash`) record an inverse here; `^Z`/`^⇧Z` and the `u` history
	// panel drive it. Session-only.
	session.journal = createJournal()
	// The shared list overlay (`u` history, `⇧T` trash): one modal list at a
	// time. `overlay` is "history" | "trash" | null; `overlayItems` holds the
	// rows the active overlay renders; `overlayIndex` is its cursor. A history
	// row carries `index` (its position in the journal), a trash row carries
	// `trashPath`.
	session.overlay = cell(null)
	session.overlayItems = cell([])
	session.overlayIndex = cell(0)
	// View mode: the three-column "explorer" (parent · current · preview) the
	// workspace opens in, or the two-pane "commander". `view.toggleMode` (`t`)
	// flips it; the workspace chrome in `components/Frame` reads it to decide
	// which columns exist. Callers that need the two-pane workspace (tests, a
	// host that prefers it) pass `viewMode: "commander"`.
	session.viewMode = cell(viewMode)
	session.active = cell("left")
	// The source/destination pane focus last was on. The auxiliary columns
	// are attached to it, so `currentId` survives focus moving into them.
	session.anchor = cell("left")
	// The pane that owns the current directory: the focused pane when focus
	// is on a source/destination pane, the anchor otherwise. Everything that
	// changes a *path* (open, up, back, breadcrumbs, the command panel's
	// relative arguments) targets it; cursor-only movement targets the
	// focused pane.
	session.currentId = derived([session.active, session.anchor], ([active, anchor]) =>
		active === "left" || active === "right" ? active : anchor,
	)
	// The repository the identity bar names: the current pane's detected VCS
	// (`"jj"` or `"git"`), null outside one. The two source/destination panes
	// own the current directory; the preview column may be pinned elsewhere,
	// so it is not read here.
	session.repoKind = derived(
		[session.currentId, left.repo, right.repo],
		([current, leftRepo, rightRepo]) => (current === "right" ? rightRepo : leftRepo)?.kind ?? null,
	)
	// The current pane's directory, tracked by the header title and by the
	// parent column's mirror.
	session.activePath = derived([session.currentId, left.path, right.path], ([current, l, r]) =>
		current === "left" ? l : r,
	)
	session.showPreview = cell(true)
	// The inspector maximized over the workspace columns (`⇧V`): the preview
	// takes the whole pane row until toggled back, leaving the identity and
	// command bars in place. Independent of `showPreview`, so restoring the
	// layout returns the inline inspector to exactly what it was.
	session.previewFull = cell(false)
	// The fullscreen inspector overlay: a framed preview covering the whole
	// viewport. It opens from `v` on a narrow terminal and from Enter on a file
	// that cannot be edited (see `core/commands#pane.enter`), and closes on Esc
	// or `v`. Core-owned so a command can request it; the renderers only show
	// it (`components/Frame#showViewer`). Independent of `showPreview` and
	// `previewFull`, which drive the inline and the maximized inspector.
	session.viewerOpen = cell(false)
	// True while the inspector is on screen in any of its three forms: inline,
	// maximized over the columns, or inside the fullscreen viewer.
	session.previewVisible = derived(
		[session.showPreview, session.previewFull, session.viewerOpen],
		([showPreview, previewFull, viewerOpen]) => Boolean(showPreview || previewFull || viewerOpen),
	)
	session.notice = cell(null)
	session.confirm = cell(null)
	// The pane whose filter input currently owns the keyboard, or null.
	session.filtering = cell(null)
	// Back/forward restore the focused column alongside the listing: each
	// source/destination pane captures `active` into its history entries and
	// restores it on Esc/⇧Esc. A column the current mode does not show falls
	// back to the pane owning the current directory.
	const focusContext = {
		get: () => session.active.value,
		set: (value) => {
			if (value) session.active.set(visibleColumn(session, value))
		},
	}
	left.setContext(focusContext)
	right.setContext(focusContext)

	// Focus remembers which source/destination pane it came from.
	effect([session.active], ([active]) => {
		if (active === "left" || active === "right") session.anchor.set(active)
	})
	// The parent column only exists in explorer mode: leaving the mode hands
	// focus back to the pane it was following.
	effect([session.viewMode], ([mode]) => {
		if (mode !== "explorer" && session.active.value === "parent") {
			session.active.set(session.currentId.value)
		}
	})
	// The parent column mirrors the parent of the current directory. It never
	// moves on its own: opening, stepping up or following a breadcrumb in it
	// retargets the current pane instead (see `core/commands`). Its cursor
	// follows the current directory, so the mirror always highlights the
	// entry the current pane is showing. Mirroring never records history: the
	// column's own back/forward stays on the paths the user navigated.
	//
	// `parent.entries` is a dependency so the cursor also lands when the
	// mirror's listing arrives *after* the effect first runs — the explorer is
	// the opening mode, so its parent column is populated by the initial
	// `load` rather than by a later navigation.
	effect([session.activePath, session.viewMode, session.panes.parent.entries], ([path, mode]) => {
		if (mode !== "explorer" || !path) return
		// The filesystem root has no parent; mirror itself rather than read a
		// blank path.
		const target = parentPath(path) ?? path
		const parent = session.panes.parent
		// Land the mirror's cursor on the current directory once its listing
		// knows it. A sync left over from an older navigation yields: it
		// checks the live path before writing the cursor.
		const sync = () => {
			if (session.activePath.value !== path) return
			const index = indexOfPath(parent.entries.value, path)
			if (index >= 0) parent.cursor.set(index)
		}
		if (parent.path.value !== target) void parent.navigate(target, { record: false }).then(sync)
		else sync()
	})

	// Bookmark panel: one modal list. `bookmarkQuery` filters the stored
	// bookmarks by name or path; `bookmarkIndex` is its cursor; `bookmarkTarget`
	// is the `{ path, isDir }` the add row would record (null while closed).
	session.bookmarkOpen = cell(false)
	session.bookmarkQuery = cell("")
	session.bookmarkIndex = cell(0)
	session.bookmarkTarget = cell(null)

	// Command panel (`:`): the one entry point, listing the CLI operations,
	// with the selected operation's arguments bound from the live context.
	// `panelQuery` filters the entry list by typed name; `panelOpIndex` selects
	// an entry in that filtered list; `panelRowIndex` is the cursor in the
	// flattened argument rows (headers + items); `panelFocus` is a
	// `PANEL_FOCUS` token ("ops": typing
	// filters entries, "args": an argument owns the keyboard). `panelDraft`
	// holds the transient bindings the user tweaks — it never mutates the real
	// pane marks.
	session.panelOpen = cell(false)
	session.panelQuery = cell("")
	session.panelOpIndex = cell(0)
	session.panelRowIndex = cell(0)
	// The bit cursor inside a permission row (0=r, 1=w, 2=x): Space toggles
	// the cell it marks, Left/Right move it.
	session.panelPermBit = cell(0)
	session.panelFocus = cell(PANEL_FOCUS.OPS)
	session.panelDraft = cell([])
	// The panel gains an explicit `server stop` entry only while the web UI
	// server is up, so the stop action is discoverable instead of hidden
	// behind "run the same mode again".
	session.panelEntries = derived([session.webServer], ([webServer]) => panelEntries({ server, running: Boolean(webServer) }))
	// Errors from a panel run stay beside the action so the user can retry
	// without losing the command draft.
	session.panelRunError = cell(null)
	// Amber/red operations are two-step: the first Run prints the assembled
	// command and arms `[Confirm]`; the second executes it. Any draft or
	// operation change disarms it.
	session.panelArmed = cell(false)

	// Picker sub-mode: while a `dest`/`path` argument is being browsed the
	// panel's argument column shows the picker's listing instead of the
	// argument rows. `pickerMode` ("dir"/"file"/"any") decides what the
	// list offers and what Enter accepts; `pickerArg` is the argument the
	// chosen path is written back to; `pickerPendingRun` reruns the operation
	// once a pick that was holding up a run completes.
	session.pickerOpen = cell(false)
	session.pickerMode = cell("dir")
	session.pickerArg = cell(-1)
	session.pickerPendingRun = cell(false)
	// The picker's editable path and the region that owns the keyboard: "path"
	// (the text field) or "rows" (the entry list). `pickerQuery` is the fragment
	// the path text resolves to and drives the pane's fuzzy filter.
	session.pickerPathText = cell("")
	session.pickerFocus = cell("path")
	// The directory relative path text resolves against (set when the picker
	// opens), so typing a relative path does not drift as the picker navigates.
	session.pickerBasePath = cell("")
	session.pickerQuery = cell("")
	// Serializes path resolution and drops stale keystrokes (see
	// `core/picker#createPickerPathQueue`).
	session.pickerPaths = createPickerPathQueue(session)

	// Auto-refresh follows the columns the view actually shows. A hidden pane
	// stops watching — and, on adapters without a native watcher, stops
	// polling the filesystem — until it is shown again; resuming re-reads it
	// once so the column never comes back stale. The picker's private pane
	// only watches while the picker is open.
	effect(
		[session.viewMode, session.showPreview, session.currentId, session.pickerOpen],
		([mode, showPreview, current, pickerOpen]) => {
			const visible = new Set()
			if (mode === "explorer") {
				visible.add("parent")
				visible.add(current)
			} else {
				visible.add("left")
				visible.add("right")
			}
			if (showPreview) visible.add("preview")
			for (const [id, pane] of Object.entries(session.panes)) {
				pane.setAutoRefresh?.(visible.has(id))
			}
			session.pickerPane?.setAutoRefresh?.(Boolean(pickerOpen))
		},
	)

	// The bookmark panel keeps its cursor on the first match whenever the query
	// changes.
	effect([session.bookmarkQuery], () => session.bookmarkIndex.set(0))

	// Filter editing is bound to the active pane: switching pane drops the
	// input so keystrokes never leak into another pane's filter.
	effect([session.active], () => session.filtering.set(null))

	// The entry under the cursor of each pane, as a small plain object. The
	// listing carries the stat details (ctime, mode, uid, gid), so the detail
	// line updates as the cursor moves without a separate stat pass.
	session.leftCursorEntry = derived([left.entries, left.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)
	session.rightCursorEntry = derived([right.entries, right.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)
	// The same detail line for the explorer's parent column.
	const parent = session.panes.parent
	session.parentCursorEntry = derived([parent.entries, parent.cursor], ([entries, cursor]) =>
		entrySummary(entries[cursor]),
	)

	// Preview target: a `view`/`stat` pin, or the current pane's cursor entry.
	// Focus on an auxiliary column does not move it: the preview keeps
	// following the pane that owns the directory.
	session.previewTarget = cell(null)
	session.previewEntry = derived(
		[session.currentId, session.leftCursorEntry, session.rightCursorEntry, session.previewTarget],
		([current, l, r, target]) => target ?? (current === "left" ? l : r),
	)

	// Moving either cursor resumes following the cursor in the preview.
	effect([session.leftCursorEntry, session.rightCursorEntry], () => session.previewTarget.set(null))

	// The preview column mirrors the directory being previewed, so a
	// directory reads as a pane in every view mode. It never moves on its
	// own for the same reason as the parent column.
	effect([session.previewEntry], ([entry]) => {
		if (!entry?.isDir) return
		if (session.panes.preview.path.value !== entry.path) {
			void session.panes.preview.navigate(entry.path, { record: false })
		}
	})

	session._previewToken = 0

	// Preview payload: text head for files, metadata for the rest; `stat`
	// targets carry `details` and render as a card even for directories.
	session.preview = cell(null)
	// True while the inspector renders a directory *column* (its own listing).
	// A `stat` card pinned on a directory is not a column: it keeps `preview`
	// populated and renders like any other card.
	session.previewDirectory = derived(
		[session.previewEntry, session.preview],
		([entry, preview]) => Boolean(entry?.isDir) && !preview,
	)
	// True while that column is actually on screen — the inspector's only
	// listing, and the only case in which cursor/mark/filter commands target
	// it (see `core/pane#isColumnPane`).
	session.previewColumn = derived(
		[session.previewVisible, session.previewDirectory],
		([visible, directory]) => Boolean(visible && directory),
	)
	// The column listing commands act on. A source/destination pane or the
	// explorer's parent mirror while it is the focus; the inspector when it
	// previews a directory and is the only listing on screen (maximized or
	// fullscreen), even if focus still sits on a pane hidden behind it; the
	// anchor pane otherwise — a file card has no listing of its own. Single
	// source for `core/pane#pane` and `focusedMarked` below.
	session.focusedId = derived(
		[session.active, session.currentId, session.viewMode, session.previewColumn, session.viewerOpen, session.previewFull],
		([active, currentId, viewMode, previewColumn, viewerOpen, previewFull]) => {
			if (previewColumn && (active === "preview" || viewerOpen || previewFull)) return "preview"
			if (active === "parent" && viewMode === "explorer") return "parent"
			return currentId
		},
	)
	// Preview body scroll requests: a monotonic `{ delta, token }` event the
	// renderers apply to their own body. Keeping it a signal rather than an
	// offset lets each renderer clamp against its own measured viewport; the
	// token makes two identical key presses distinct writes.
	session.previewScroll = cell({ delta: 0, token: 0 })
	session._stopPreviewWatch = effect([session.previewEntry, session.showPreview], async ([entry, show]) => {
		if (!show || !entry) {
			session.preview.set(null)
			return
		}
		// The preview follows symlinks: its title names the traversal and its
		// kind comes from what the link points at, not from the link's own
		// name (a `notes -> README.md` previews as markdown). A compressed
		// entry is classified by the name inside it and read through its
		// decompressor (`notes.txt.gz` previews as text).
		const source = previewSource(entry)
		const kind = entry.isDir ? "directory" : previewKind(source.innerExt)
		if (entry.details) {
			session.preview.set({
				kind,
				title: source.title,
				size: entry.size,
				ext: source.ext,
				innerExt: source.innerExt,
				compression: source.compression,
				details: entry.details,
				text: null,
			})
			return
		}
		if (entry.isDir) {
			session.preview.set(null)
			return
		}
		const token = ++session._previewToken
		let head = null
		if (kind === "text") {
			if (source.compression) {
				const bytes = await fs
					.readBytes(entry.path, compressedBytes(source.compression))
					.catch(() => null)
				head = bytes
					? await decompressHead(bytes, source.compression, PREVIEW_BYTES).catch(() => null)
					: null
			} else {
				head = await fs.readTextHead(entry.path, PREVIEW_BYTES).catch(() => null)
			}
		}
		if (token !== session._previewToken) return
		session.preview.set({
			kind,
			title: source.title,
			size: entry.size,
			ext: source.ext,
			innerExt: source.innerExt,
			compression: source.compression,
			text: head === null || hasBinaryByte(head) ? null : head,
		})
	})

	// Selection filesets: each pane's non-empty mark buffer ($A for the source
	// pane, $B for the destination), plus $FILE for the entry the preview is
	// following. These are the values scripting-mode completions offer.
	session.filesets = derived(
		[left.marked, right.marked, session.previewEntry],
		([leftMarks, rightMarks, previewEntry]) => {
			const sets = []
			if (leftMarks && leftMarks.size) {
				const label = PANE_BUFFERS.left
				sets.push({ id: `$${label}`, label, paths: [...leftMarks], count: leftMarks.size })
			}
			if (rightMarks && rightMarks.size) {
				const label = PANE_BUFFERS.right
				sets.push({ id: `$${label}`, label, paths: [...rightMarks], count: rightMarks.size })
			}
			if (previewEntry && !previewEntry.isDir) {
				sets.push({
					id: "$FILE",
					label: "FILE",
					paths: [previewEntry.path],
					count: 1,
				})
			}
			return sets
		},
	)

	// Bookmark rows: the stored bookmarks fuzzily matched by name or path,
	// ranked by fzy score. With no query, a first row offers to record
	// `bookmarkTarget` when that path is not bookmarked yet.
	session.bookmarkItems = derived(
		[session.bookmarks.entries, session.bookmarkQuery, session.bookmarkTarget],
		([entries, query, target]) => {
			const rows = Object.entries(entries ?? {}).map(([name, entry]) => ({ key: name, name, ...entry }))
			const q = `${query ?? ""}`.trim()
			let items
			if (!q) {
				items = rows.sort((a, b) => a.name.localeCompare(b.name))
			} else {
				const ranked = []
				for (const row of rows) {
					const best = Math.max(
						hasMatch(q, row.name) ? score(q, row.name) : -Infinity,
						hasMatch(q, row.path) ? score(q, row.path) : -Infinity,
					)
					if (best > -Infinity) ranked.push({ row, score: best })
				}
				ranked.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.row.name.localeCompare(b.row.name)))
				items = ranked.map((match) => match.row)
			}
			if (!q && target && !items.some((row) => row.path === target.path)) {
				items = [{ key: BOOKMARK_ADD_KEY, add: true, name: BOOKMARK_ADD_KEY, path: target.path, isDir: target.isDir }, ...items]
			}
			return items
		},
	)

	// Command bar rows: contextual key hints (see core/bar). The modal that
	// owns the keyboard comes first, then the full preview mode, then the
	// focused workspace column.
	session.commandBarItems = derived(
		[
			session.filtering,
			session.bookmarkOpen,
			session.panelOpen,
			session.pickerOpen,
			session.panelArmed,
			session.overlay,
			session.confirm,
			session.viewerOpen,
			session.previewFull,
			session.previewDirectory,
			session.active,
			session.viewMode,
			session.previewVisible,
		],
		([filtering, bookmarkOpen, panelOpen, pickerOpen, panelArmed, overlay, confirm, viewerOpen, previewFull, previewDirectory, active, viewMode, previewVisible]) =>
			getCommandBarItems({
				active,
				bookmarkOpen,
				confirm,
				filtering,
				overlay,
				panelArmed,
				panelOpen,
				pickerOpen,
				previewDirectory,
				previewFull,
				previewVisible,
				viewMode,
				viewerOpen,
			}),
	)
	// The marked count trailing the bar follows the focused listing: the
	// parent/preview mirrors included, and the anchor pane when the inspector
	// shows a file (it has no listing of its own).
	session.focusedMarked = derived(
		[session.focusedId, left.marked, right.marked, session.panes.parent.marked, session.panes.preview.marked],
		([focused, leftMarks, rightMarks, parentMarks, previewMarks]) => {
			if (focused === "preview") return previewMarks
			if (focused === "parent") return parentMarks
			return focused === "right" ? rightMarks : leftMarks
		},
	)

	// The entry list filtered by the typed query; `panelOpIndex` indexes into
	// this filtered list.
	session.panelFiltered = derived(
		[session.panelEntries, session.panelQuery],
		([entries, query]) => filterPanelEntries(entries, query),
	)
	// The entry the command panel is editing, and its bound arguments.
	session.panelEntry = derived(
		[session.panelFiltered, session.panelOpIndex],
		([entries, index]) => entries[Math.max(0, Math.min(index, entries.length - 1))] ?? null,
	)
	// The picker's visible listing for the current mode: a destination picker
	// lists directories only, so every row is a valid choice; a file/any
	// picker keeps the listing intact, where a directory row descends.
	session.pickerVisible = derived(
		[session.pickerPane.entries, session.pickerMode],
		([entries, mode]) => pickerVisibleEntries(entries, mode),
	)
	session.pickerRows = derived(
		[session.pickerVisible, session.pickerPane.path],
		([entries, path]) => pickerRowList(entries, path),
	)
	// The argument column: the picker's entry rows while picking; otherwise the
	// selected operation's arguments followed by its explicit Run action.
	session.panelRows = derived(
		[session.panelDraft, session.panelEntry, session.pickerOpen, session.pickerRows, session.panelRunError, session.panelArmed, session.activePath, session.webServer],
		([draft, entry, open, picker, runError, armed, activePath, webServer]) => {
			if (open) return picker
			if (!entry) return []
			const rows = panelRowList(draft)
			// Read-only context rows can be clicked to copy their value. The
			// server token is revealed only when its panel entry is selected.
			if (!rows.length && (entry.showPath || entry.showToken)) {
				const name = entry.showToken ? "TOKEN" : "PATH"
				const value = entry.showToken ? (webServer?.token ?? "") : (activePath ?? "")
				rows.push({
					type: "arg",
					key: `arg:${name.toLowerCase()}`,
					rowIndex: 0,
					argIndex: -1,
					itemIndex: -1,
					name,
					summary: value,
					kind: entry.showToken ? "literal" : "path",
					role: "active",
					optional: false,
					variadic: false,
					textual: false,
					editable: false,
					picker: false,
					mode: "dir",
					multi: false,
					readonly: true,
					value,
					count: 0,
				})
			}
			rows.push({
				type: "run",
				key: "panel:run",
				rowIndex: rows.length,
				name: runError ? "Retry" : armed ? "Confirm" : "Run",
				risk: entry.risk ?? null,
				group: entry.group ?? "File",
				error: runError,
				armed,
				// The command printed below `[Confirm]`.
				command: armed ? panelCommandLine(session, entry, draft) : null,
			})
			return rows
		},
	)
	// The right pane's argument blocks (a label line over its value/field, and
	// a bordered item list per selection).
	// Operation-specific preflight output (currently `replace`'s old → new
	// mapping) is distinct from the assembled shell command.
	session.panelPreview = derived(
		[session.panelDraft, session.panelEntry],
		([draft, entry]) => {
			const preview = entry?.op?.preview?.(session, argvFor(draft), draft)
			return typeof preview === "string" ? preview : null
		},
	)
	// Preserve the existing `panelCommand` projection for consumers: operations
	// with a custom preview return it; all others return the assembled command,
	// one item per line when it carries several tokens.
	// The panel renders custom preflight output separately from its Run action.
	session.panelCommand = derived(
		[session.panelDraft, session.panelEntry, session.panelPreview],
		([draft, entry, preview]) => {
			if (typeof preview === "string") return preview
			return panelCommandLine(session, entry, draft)
		},
	)
	session.panelRunnable = derived([session.panelDraft], ([draft]) => panelRunnable(draft))
	// The argument row under the right pane's cursor, and whether it is a
	// textual argument (so the panel focuses its value field).
	session.panelCursorRow = derived(
		[session.panelRows, session.panelRowIndex],
		([rows, row]) => rowAt(rows, row),
	)
	session.panelTextual = derived([session.panelCursorRow], ([row]) => isTextualRow(row))
	// The text the value field edits. A plain cell (the input writes through
	// it); an effect copies the focused argument's value in whenever the cursor
	// lands on a textual row, and another folds typing back into the transient
	// draft so a value survives moving to another argument.
	session.panelValue = cell("")
	effect([session.panelCursorRow], ([row]) => {
		if (isTextualRow(row)) session.panelValue.set(`${row.value ?? ""}`)
	})
	effect([session.panelValue], ([value]) => {
		const row = session.panelCursorRow.value
		if (isTextualRow(row)) {
			session.panelDraft.set(withArgValue(session.panelDraft.value, row.argIndex, value))
		}
	})

	// The command-list column's rows: the filtered operations.
	session.panelItems = derived([session.panelFiltered], ([entries]) => panelEntryRows(entries))

	// Re-bind the panel draft when the panel opens or the selected entry
	// changes. The panel is modal, so the pane context does not change
	// underneath it; opening the panel owns the draft while it is open.
	effect([session.panelOpen, session.panelEntry], ([open, entry]) => {
		if (!open) return
		const draft = bindArgs(session, entry)
		prefillPanelDraft(session, entry, draft)
		session.panelDraft.set(draft)
	})
	// Selecting another entry resets the argument cursor.
	effect([session.panelEntry], () => {
		session.panelRowIndex.set(0)
		session.panelRunError.set(null)
		session.panelArmed.set(false)
	})
	// Editing the draft after an error gives the next attempt a clean action
	// row, and disarms a pending Confirm (the command changed under it).
	effect([session.panelDraft], () => {
		if (session.panelRunError.value) session.panelRunError.set(null)
		if (session.panelArmed.value) session.panelArmed.set(false)
	})
	// Typing a query re-anchors the entry cursor on the first match.
	effect([session.panelQuery], () => {
		session.panelOpIndex.set(0)
	})

	// The editable path resolves to a directory plus a filter fragment; the
	// queue drops stale keystrokes and keeps fast typing from landing an older
	// navigation after a newer one (see `core/picker#createPickerPathQueue`).
	effect([session.pickerPathText, session.pickerOpen], ([text, open]) => {
		if (open) session.pickerPaths.schedule(text)
	})

	// The picker's resolved fragment drives the picker pane's fuzzy filter and
	// re-anchors the picker cursor on the first match. Only while picking, so
	// the effect can never reset the argument cursor outside the picker.
	effect([session.pickerQuery], ([query]) => {
		session.pickerPane.setFilter(`${query ?? ""}`)
		if (session.pickerOpen.value) {
			const rows = session.pickerRows.value
			const firstMatch = `${query ?? ""}` ? rows.findIndex((row) => row.type === "entry") : 0
			session.panelRowIndex.set(firstMatch >= 0 ? firstMatch : 0)
		}
	})
	// Closing the panel leaves the picker (it lives inside the panel).
	effect([session.panelOpen], ([open]) => {
		if (open) return
		session.pickerOpen.set(false)
		session.pickerArg.set(-1)
		session.pickerPendingRun.set(false)
		session.panelArmed.set(false)
	})

	session.dispatch = createDispatch(session)
	session.load = () => load(session)
	return session
}

// Function: visibleColumn
// `id` when the current view mode shows that column, else the pane that owns
// the current directory. Used to keep a restored focus on a column that
// exists.
function visibleColumn(session, id) {
	const current = session.currentId.value
	const columns =
		session.viewMode.value === "explorer"
			? session.showPreview.value
				? ["parent", current, "preview"]
				: ["parent", current]
			: ["left", "right"]
	return columns.includes(id) ? id : current
}

// Function: load
// Reads the initial listing for every column — the two panes plus the two
// mirrors, which start on a valid path and so may never navigate — and the
// persisted bookmarks.
async function load(session) {
	await Promise.all([
		...Object.values(session.panes).map((pane) => pane.refresh()),
		session.bookmarks.load?.(),
	])
}

// Function: prefillPanelDraft
// Seeds a freshly bound draft: `replace` prefills FIND with a single selected
// basename; exact `rename` prefills FROM and TO with that basename and the
// containing directory from the active entry (or uses the pane's current
// directory when there is none).
function prefillPanelDraft(session, entry, draft) {
	const name = entry?.op?.name
	if (name === "replace") {
		const find = (draft ?? []).find((binding) => binding.name === "FIND")
		const selection = (draft ?? []).find((binding) => binding.kind === "selection")
		const selected = (selection?.items ?? []).filter((item) => item.selected)
		if (find && selected.length === 1) find.value = basename(selected[0].path)
		return
	}
	if (name !== "rename") return
	const active = session.active?.value
	// The focused listing, including the inspector when it is the only one on
	// screen (see `core/pane#pane`).
	const focused = session.focusedId?.value ?? active
	const auxiliaryPane =
		(focused === "parent" && session.panes.parent) ||
		(focused === "preview" && session.panes.preview)
	const pane = auxiliaryPane || session.panes[session.currentId?.value ?? active] || session.panes.left
	const from = (draft ?? []).find((binding) => binding.name === "FROM")
	const to = (draft ?? []).find((binding) => binding.name === "TO")
	const path = (draft ?? []).find((binding) => binding.name === "PATH")
	const marked = [...(pane.marked?.value ?? [])]
	const selectedPath =
		marked.length === 1 ? marked[0] : marked.length === 0 ? pane.currentEntry?.()?.path : null
	if (selectedPath) {
		const selectedName = basename(selectedPath)
		if (from) from.value = selectedName
		// Matching FROM is the safe starting point: the user edits the one
		// segment that changes, and the diff line under TO shows where.
		if (to) to.value = selectedName
		if (path) path.value = parentPath(selectedPath) ?? pane.path.value ?? ""
	} else if (path) {
		path.value = pane.path.value ?? ""
	}
}

// Function: panelCommandLine
// The command the panel prints below `[Confirm]`: an operation's own
// `displayParts` when it has one (rename spells out the two resolved paths),
// otherwise its assembled argument tokens, laid out one item per line and
// hanging under the command name (see `panelCommandLines`).
function panelCommandLine(session, entry, draft) {
	const parts =
		entry?.op?.displayParts?.(session, argvFor(draft), draft) ?? panelCommandParts(draft)
	return panelCommandLines(entry?.name ?? "", parts)
}

function entrySummary(entry) {
	if (!entry) return null
	return {
		name: entry.name,
		path: entry.path,
		isDir: entry.isDir,
		isSymlink: entry.isSymlink,
		isDevice: entry.isDevice,
		size: entry.size,
		mtimeMs: entry.mtimeMs,
		ctimeMs: entry.ctimeMs,
		mode: entry.mode,
		uid: entry.uid,
		gid: entry.gid,
		owner: entry.owner,
		ext: entry.ext,
		// The symlink's raw target, so the preview and the header can name
		// where the link goes.
		target: entry.target ?? null,
		// Repository status (see `core/vcs`), shown by the detail line.
		vcsStatus: entry.vcsStatus ?? null,
	}
}

export { createSession, load }
