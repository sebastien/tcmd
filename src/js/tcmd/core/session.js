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
// (see `currentId` / `core/commands#currentPane`).

import { cell, derived, effect } from "select/state/cells"
import { createBookmarks } from "./bookmarks.js"
import { createDispatch, getAppCommands, getCommandBarItems } from "./commands.js"
import { createNullOs } from "./os.js"
import { PANEL_FOCUS, bindArgs, filterPanelEntries, isTextualRow, panelCommand, panelEntries, panelRowList, panelRunnable, rowAt, withArgValue } from "./panel.js"
import { basename, extname, join, parent as parentPath } from "./path.js"
import { createPane, PANE_BUFFERS } from "./pane.js"
import { hasMatch, score } from "../vendor/fzy.js"

const PREVIEW_BYTES = 65536

// Function: createSession
// Creates the shared model for a two-pane browser.
//
// Example:
// ```javascript
// const session = createSession({ fs: createNodeFs(), left: pane, right: pane })
// await session.load()
// session.dispatch("pane.toggle")
// ```
function createSession({ fs, os, left, right, host, bookmarks } = {}) {
	const session = {}
	session.fs = fs
	session.os = os ?? createNullOs()
	session.panes = { left, right }
	// Auxiliary panes: the explorer's parent column and the inspector's
	// directory column. Both start on a valid path so a refresh before their
	// first sync can never read a blank one.
	session.panes.parent = createPane({ fs, path: parentPath(left.path.value) ?? left.path.value })
	session.panes.preview = createPane({ fs, path: left.path.value })
	// Shown in the header title; empty when the environment has no hostname.
	session.host = host ?? ""
	// Bookmark model (named paths). The store defaults to in-memory.
	session.bookmarks = bookmarks ?? createBookmarks()
	// View mode: the two-pane "commander" workspace, or the three-column
	// "explorer" (parent · current · preview). `view.toggleMode` (`t`) flips
	// it; the workspace chrome in `components/Frame` reads it to decide which
	// columns exist.
	session.viewMode = cell("commander")
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
	// The current pane's directory, tracked by the header title and by the
	// parent column's mirror.
	session.activePath = derived([session.currentId, left.path, right.path], ([current, l, r]) =>
		current === "left" ? l : r,
	)
	session.showPreview = cell(true)
	session.notice = cell(null)
	session.confirm = cell(null)
	// The pane whose filter input currently owns the keyboard, or null.
	session.filtering = cell(null)

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
	// retargets the current pane instead (see `core/commands`).
	effect([session.activePath, session.viewMode], ([path, mode]) => {
		if (mode !== "explorer" || !path) return
		// The filesystem root has no parent; mirror itself rather than read a
		// blank path.
		const target = parentPath(path) ?? path
		if (session.panes.parent.path.value !== target) void session.panes.parent.navigate(target)
	})

	// Bookmark overlay: `bookmarkMode` is "name" while recording (an input for
	// the new bookmark's name) or "list" while jumping (a fuzzy picker).
	session.bookmarkOpen = cell(false)
	session.bookmarkMode = cell("list")
	session.bookmarkQuery = cell("")
	session.bookmarkIndex = cell(0)
	// The path being recorded while in "name" mode.
	session.bookmarkTarget = cell(null)

	// Command panel (`:`): the one entry point, listing the CLI operations
	// first and the TinyCmd actions after, with the selected operation's
	// arguments bound from the live context. `panelQuery` filters the entry
	// list by typed name; `panelOpIndex` selects an entry in that filtered
	// list; `panelRowIndex` is the cursor in the flattened argument rows
	// (headers + items); `panelFocus` is a `PANEL_FOCUS` token ("ops": typing
	// filters entries, "args": an argument owns the keyboard). `panelDraft`
	// holds the transient bindings the user tweaks — it never mutates the real
	// pane marks.
	session.panelOpen = cell(false)
	session.panelQuery = cell("")
	session.panelOpIndex = cell(0)
	session.panelRowIndex = cell(0)
	session.panelFocus = cell(PANEL_FOCUS.OPS)
	session.panelDraft = cell([])
	session.panelEntries = cell(panelEntries(getAppCommands()))

	// The bookmark picker keeps its cursor on the first match whenever the
	// query changes.
	effect([session.bookmarkQuery], () => session.bookmarkIndex.set(0))

	// Filter editing is bound to the active pane: switching pane drops the
	// input so keystrokes never leak into another pane's filter.
	effect([session.active], () => session.filtering.set(null))

	// The entry under the cursor of each pane, as a small plain object. The
	// stat details (ctime, mode, uid, gid) come from the directory's lazy
	// `cursorStat`, so the pane detail line updates as the cursor moves.
	session.leftCursorEntry = derived([left.entries, left.cursor, left.cursorStat], ([entries, cursor, stat]) =>
		entrySummary(stat ?? entries[cursor]),
	)
	session.rightCursorEntry = derived([right.entries, right.cursor, right.cursorStat], ([entries, cursor, stat]) =>
		entrySummary(stat ?? entries[cursor]),
	)
	// The same detail line for the explorer's parent column.
	const parent = session.panes.parent
	session.parentCursorEntry = derived([parent.entries, parent.cursor, parent.cursorStat], ([entries, cursor, stat]) =>
		entrySummary(stat ?? entries[cursor]),
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
		if (session.panes.preview.path.value !== entry.path) void session.panes.preview.navigate(entry.path)
	})

	session._previewToken = 0

	// Preview payload: text head for files, metadata for the rest; `stat`
	// targets carry `details` and render as a card even for directories.
	session.preview = cell(null)
	session._stopPreviewWatch = effect([session.previewEntry, session.showPreview], async ([entry, show]) => {
		if (!show || !entry) {
			session.preview.set(null)
			return
		}
		// The preview follows symlinks: its title names the traversal and its
		// kind comes from what the link points at, not from the link's own
		// name (a `notes -> README.md` previews as markdown).
		const source = previewSource(entry)
		const kind = entry.isDir ? "directory" : previewKind({ ext: source.ext })
		if (entry.details) {
			session.preview.set({
				kind,
				title: source.title,
				size: entry.size,
				ext: source.ext,
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
		const head =
			kind === "text" ? await fs.readTextHead(entry.path, PREVIEW_BYTES).catch(() => null) : null
		if (token !== session._previewToken) return
		session.preview.set({
			kind,
			title: source.title,
			size: entry.size,
			ext: source.ext,
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

	// Bookmark picker rows: the bookmarks fuzzily matched by name or path,
	// ranked by fzy score. Only meaningful in "list" mode.
	session.bookmarkItems = derived(
		[session.bookmarks.entries, session.bookmarkQuery, session.bookmarkMode],
		([entries, query, mode]) => {
			if (mode !== "list") return []
			const rows = Object.entries(entries ?? {}).map(([name, entry]) => ({ name, ...entry }))
			const q = `${query ?? ""}`.trim()
			if (!q) return rows.sort((a, b) => a.name.localeCompare(b.name))
			const ranked = []
			for (const row of rows) {
				const best = Math.max(
					hasMatch(q, row.name) ? score(q, row.name) : -Infinity,
					hasMatch(q, row.path) ? score(q, row.path) : -Infinity,
				)
				if (best > -Infinity) ranked.push({ row, score: best })
			}
			ranked.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.row.name.localeCompare(b.row.name)))
			return ranked.map((match) => match.row)
		},
	)

	// Command bar rows: context-dependent key hints (see core/commands). The
	// panel button is dropped when a host disables the panel.
	session.commandBarItems = derived(
		[session.filtering, session.bookmarkOpen, session.bookmarkMode, session.panelOpen],
		([filtering, bookmarkOpen, bookmarkMode, panelOpen]) =>
			getCommandBarItems({ filtering, bookmarkOpen, bookmarkMode, panelOpen }),
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
	session.panelRows = derived([session.panelDraft], ([draft]) => panelRowList(draft))
	// The assembled command line the draft maps to, and whether it is runnable.
	// The preview answers "what will this run" as the shell would see it,
	// prefixed with the entry name; a `«NAME»` marks a required argument still
	// to fill. A TinyCmd action has no arguments, so it previews as its title.
	session.panelCommand = derived(
		[session.panelDraft, session.panelEntry],
		([draft, entry]) => {
			const args = panelCommand(draft)
			const name = entry?.name ?? ""
			return args ? `${name} ${args}` : name
		},
	)
	session.panelRunnable = derived([session.panelDraft], ([draft]) => panelRunnable(draft))
	// The cursor row and whether it is a textual argument (so the panel focuses
	// its text field).
	session.panelCursorRow = derived(
		[session.panelRows, session.panelRowIndex],
		([rows, row]) => rowAt(rows, row),
	)
	session.panelTextual = derived([session.panelCursorRow], ([row]) => isTextualRow(row))
	// The text the input edits. A plain cell (the input writes through it); an
	// effect copies the focused binding's value in whenever the cursor lands on
	// a textual argument, and another folds typing back into the transient
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

	// A picker-row projection for the entry list (left column), over the
	// query-filtered entries. `summary` is the argument list a CLI operation
	// shows — its signature with the leading name stripped — or the key
	// shortcut of a TinyCmd action; `source` is the namespace marker the row
	// renders.
	session.panelItems = derived([session.panelFiltered], ([entries]) =>
		entries.map((entry) => ({
			id: entry.id,
			name: entry.name,
			summary: entry.summary,
			risk: entry.risk,
			source: entry.source,
		})),
	)

	// Re-bind the panel draft when the panel opens or the selected entry
	// changes. The panel is modal, so the pane context does not change
	// underneath it; opening the panel owns the draft while it is open.
	effect([session.panelOpen, session.panelEntry], ([open, entry]) => {
		if (!open) return
		session.panelDraft.set(bindArgs(session, entry))
	})
	// Selecting another entry resets the argument cursor.
	effect([session.panelEntry], () => {
		session.panelRowIndex.set(0)
	})
	// Typing a query re-anchors the entry cursor on the first match.
	effect([session.panelQuery], () => {
		session.panelOpIndex.set(0)
	})

	session.dispatch = createDispatch(session)
	session.load = () => load(session)
	return session
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
	}
}

// Function: previewSource
// What the preview renders *through* a symlink: `title` names the traversal
// (`notes -> ../real/notes`) so it is visible in the header, and `ext` is the
// target's extension, so a link previews with the kind of what it points at
// rather than the kind of its own name. Plain entries pass through unchanged.
function previewSource(entry) {
	const target = entry?.isSymlink && entry.target ? `${entry.target}` : null
	if (!target || !entry?.path) return { title: basename(entry?.path ?? ""), ext: entry?.ext ?? null }
	const ext = extname(target) ?? entry.ext ?? null
	return { title: `${basename(entry.path)} -> ${target}`, ext }
}

// Function: previewKind
// Preview classification for file entries; directories are not previewed.
function previewKind(entry) {
	const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]
	const media = ["mp3", "wav", "ogg", "flac", "mp4", "webm", "mkv", "mov", "pdf"]
	if (entry.ext && image.includes(entry.ext)) return "image"
	if (entry.ext && media.includes(entry.ext)) return "media"
	return "text"
}

function hasBinaryByte(text) {
	for (let i = 0; i < 2048 && i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code < 9 || (code > 13 && code < 32)) return true
	}
	return false
}

export { createSession, load, previewSource }
