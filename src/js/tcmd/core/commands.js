// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/commands
// Command registry and dispatch. Commands are pure operations over the
// session model: `run(session, payload)`. Views never mutate state directly —
// they call `session.dispatch(id, payload)`, keeping the model the single
// source of truth for every presentation layer.
//
// Commands carry presentation metadata:
// - `kind`: "ui" for UI-level actions; the command panel lists the visible UI
//   actions alongside the CLI operations (see core/panel.js).
// - `bar`: true when the command appears in the command bar's key hints.
// - `hidden`: true for internal commands that never show in the panel.

import { DEFAULT_KEYMAP, keyGlyph } from "./keymap.js"
import { basename, parent as parentOf } from "./path.js"
import { PANEL_FOCUS, argvFor, bindingAt, missingBinding, rowAt, withArgValue, withToggledItem } from "./panel.js"
import { hasBinaryByte, previewKind, SNIFF_BYTES } from "./preview.js"
import { clampCursor, moveCursor } from "./selection.js"
import { currentPane } from "./pane.js"
import { runLine } from "./script.js"
import { getOperation, refreshPanes, runOperation } from "./operations.js"

// Constant: PAGE / JUMP
// Cursor movement steps: a page for PgUp/PgDn, a shorter jump for the
// ctrl-arrow accelerators.
const PAGE = 10
const JUMP = 5

// Constant: FILTER_KEYS
// Command-bar hints shown while a pane filter is capturing input.
const FILTER_KEYS = [
	{ id: null, title: "Navigate", keys: "↑/↓" },
	{ id: null, title: "Done", keys: "Enter", primary: true },
	{ id: null, title: "Clear", keys: "Esc" },
]

// Constant: BOOKMARK_NAME_KEYS
// Command-bar hints while naming a bookmark.
const BOOKMARK_NAME_KEYS = [
	{ id: null, title: "Save", keys: "Enter", primary: true },
	{ id: null, title: "Cancel", keys: "Esc" },
]

// Constant: BOOKMARK_LIST_KEYS
// Command-bar hints while picking a bookmark.
const BOOKMARK_LIST_KEYS = [
	{ id: null, title: "Navigate", keys: "↑/↓" },
	{ id: null, title: "Jump", keys: "Enter", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: PANEL_HINT_KEYS
// Command-bar hints while the command panel is open.
const PANEL_HINT_KEYS = [
	{ id: null, title: "Command", keys: "↑/↓" },
	{ id: null, title: "Arg", keys: "⇥" },
	{ id: null, title: "Browse", keys: "^O" },
	{ id: null, title: "Toggle", keys: "Spc" },
	{ id: null, title: "Run", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: PANEL_PICK_KEYS
// Command-bar hints while the panel's file picker owns the keyboard.
const PANEL_PICK_KEYS = [
	{ id: null, title: "Filter", keys: "type" },
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Open", keys: "→" },
	{ id: null, title: "Choose", keys: "↵", primary: true },
	{ id: null, title: "Here", keys: "^↵" },
	{ id: null, title: "Up", keys: "⌫" },
	{ id: null, title: "Back", keys: "Esc" },
]

// Constant: HISTORY_KEYS / TRASH_KEYS
// Command-bar hints while the shared list overlay owns the keyboard.
const HISTORY_KEYS = [
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Jump", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

const TRASH_KEYS = [
	{ id: null, title: "Row", keys: "↑/↓" },
	{ id: null, title: "Restore", keys: "↵", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

const commands = [
	{
		id: "nav.up",
		title: "Cursor up",
		keys: "↑",
		kind: "ui",
		run(session) {
			bump(session, -1)
		},
	},
	{
		id: "nav.down",
		title: "Cursor down",
		keys: "↓",
		kind: "ui",
		run(session) {
			bump(session, 1)
		},
	},
	{
		id: "nav.pageUp",
		title: "Page up",
		keys: "PgUp",
		kind: "ui",
		run(session) {
			bump(session, -PAGE)
		},
	},
	{
		id: "nav.pageDown",
		title: "Page down",
		keys: "PgDn",
		kind: "ui",
		run(session) {
			bump(session, PAGE)
		},
	},
	{
		id: "nav.jumpUp",
		title: "Jump up",
		keys: "^↑",
		kind: "ui",
		run(session) {
			bump(session, -JUMP)
		},
	},
	{
		id: "nav.jumpDown",
		title: "Jump down",
		keys: "^↓",
		kind: "ui",
		run(session) {
			bump(session, JUMP)
		},
	},
	{
		id: "nav.home",
		title: "First entry",
		keys: "Home",
		kind: "ui",
		run(session) {
			pane(session).cursor.set(0)
		},
	},
	{
		id: "nav.end",
		title: "Last entry",
		keys: "End",
		kind: "ui",
		run(session) {
			pane(session).cursor.set(Math.max(0, pane(session).entries.value.length - 1))
		},
	},
	{
		id: "pane.enter",
		title: "Open",
		keys: "Enter",
		kind: "ui",
		bar: true,
		primary: true,
		run(session) {
			// The entry under the *focused* pane's cursor decides where the
			// current directory goes: a directory descends into it. On an
			// auxiliary column (parent/preview) that means the current pane
			// follows the selection, which is what keeps the mirror in step.
			const focused = pane(session)
			const entry = focused.currentEntry()
			if (!entry) return
			const current = currentPane(session)
			if (entry.isDir) return current.navigate(entry.path)
			// A file outside the current pane pins the inspector on it before
			// it is opened, so the preview follows the entry that was acted on.
			if (focused !== current) {
				session.previewTarget.set(entry)
				session.showPreview.set(true)
			}
			// A file: edit it when it is a text file the host can edit,
			// otherwise show it fullscreen (see `openFile`).
			return openFile(session, current, entry)
		},
	},
	{
		id: "pane.up",
		title: "Parent",
		keys: "←",
		kind: "ui",
		bar: true,
		run(session) {
			// Stepping up always moves the current directory: the parent
			// column mirrors it, so navigating that column itself would
			// break the mirror.
			return currentPane(session).up()
		},
	},
	{
		id: "pane.back",
		title: "Back",
		keys: "Esc",
		kind: "ui",
		run(session) {
			return currentPane(session).back()
		},
	},
	{
		id: "pane.forward",
		title: "Forward",
		keys: "⇧Esc",
		kind: "ui",
		run(session) {
			return currentPane(session).forward()
		},
	},
	{
		id: "pane.reload",
		title: "Reload",
		keys: "^R",
		kind: "ui",
		bar: true,
		run(session) {
			return pane(session).refresh()
		},
	},
	{
		id: "pane.toggle",
		title: "Switch",
		keys: "Tab",
		kind: "ui",
		bar: true,
		run(session) {
			// Cycle through the columns the current view mode shows:
			// source ⇄ destination in commander, parent → current → preview
			// in explorer. Focus parked on a column that is not in the cycle
			// (the inspector in commander) lands on the other side.
			const current = session.currentId.value
			const order =
				session.viewMode.value === "explorer"
					? session.showPreview.value
						? ["parent", current, "preview"]
						: ["parent", current]
					: ["left", "right"]
			const at = order.indexOf(session.active.value)
			const next =
				at >= 0
					? order[(at + 1) % order.length]
					: order.find((paneId) => paneId !== current) ?? order[0]
			session.active.set(next)
		},
	},
	{
		id: "list.mark",
		title: "Mark",
		keys: "Spc",
		kind: "ui",
		bar: true,
		run(session) {
			pane(session).toggleMark()
		},
	},
	{
		id: "bookmark.record",
		title: "Bookmark",
		keys: "b",
		kind: "ui",
		bar: true,
		run(session) {
			// Record the entry under the cursor; fall back to the pane's
			// directory when the listing is empty.
			const entry = pane(session).currentEntry()
			const path = entry?.path ?? pane(session).path.value
			const isDir = entry ? Boolean(entry.isDir) : true
			const existing = session.bookmarks.find(path)
			if (existing) {
				// Already bookmarked: no need to re-name it.
				session.notice.set({ kind: "tip", text: `bookmark ${existing.name}` })
				return
			}
			// The default name is the path's basename.
			session.bookmarkTarget.set({ path, isDir })
			session.bookmarkQuery.set(basename(path))
			session.bookmarkMode.set("name")
			session.bookmarkOpen.set(true)
		},
	},
	{
		id: "bookmark.jump",
		title: "Bookmarks",
		keys: "g",
		kind: "ui",
		bar: true,
		run(session) {
			session.bookmarkTarget.set(null)
			session.bookmarkQuery.set("")
			session.bookmarkMode.set("list")
			session.bookmarkOpen.set(true)
		},
	},
	{
		id: "bookmark.up",
		title: "Previous bookmark",
		kind: "ui",
		hidden: true,
		run(session) {
			moveBookmark(session, -1)
		},
	},
	{
		id: "bookmark.down",
		title: "Next bookmark",
		kind: "ui",
		hidden: true,
		run(session) {
			moveBookmark(session, 1)
		},
	},
	{
		id: "bookmark.save",
		title: "Save bookmark",
		kind: "ui",
		hidden: true,
		run(session) {
			const name = `${session.bookmarkQuery.value ?? ""}`.trim()
			const target = session.bookmarkTarget.value
			if (!name) {
				session.notice.set({ kind: "warning", text: "bookmark needs a name" })
				return
			}
			if (!target) {
				closeBookmark(session)
				return
			}
			// Close synchronously: the global key handler and the input's
			// `on:enter` can both fire, and a second save while the overlay is
			// still open would re-record and flash the notice twice. A rejected
			// `record` (rejected name) still surfaces through the dispatch's
			// error notice.
			closeBookmark(session)
			return session.bookmarks.record(name, target.path, target.isDir).then(() => {
				session.notice.set({ kind: "tip", text: `bookmarked ${name}` })
			})
		},
	},
	{
		id: "bookmark.setIndex",
		title: "Highlight bookmark",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			session.bookmarkIndex.set(Math.max(0, payload?.index ?? 0))
		},
	},
	{
		id: "bookmark.select",
		title: "Jump to bookmark",
		kind: "ui",
		hidden: true,
		async run(session) {
			const items = session.bookmarkItems.value
			const item = items[clampCursor(session.bookmarkIndex.value, items.length)]
			if (!item) return
			const target = currentPane(session)
			const path = item.path
			// Resolve the kind when it is unknown (legacy path-only bookmark).
			let isDir = item.isDir
			if (isDir == null) isDir = Boolean((await session.fs.stat(path))?.isDir)
			closeBookmark(session)
			// A directory: open it (show its contents).
			if (isDir) return target.navigate(path)
			// A file: select it in its directory and preview it (a path at the
			// filesystem root has no parent: stay at the root).
			return target.navigate(parentOf(path) ?? "/").then(() => {
				const entries = target.entries.value
				const index = entries.findIndex((entry) => entry.path === path)
				if (index < 0) return
				target.cursor.set(index)
				// Pin the preview so it shows even if the effect lags the cursor.
				session.previewTarget.set(target.currentEntry() ?? null)
				session.showPreview.set(true)
			})
		},
	},
	{
		id: "bookmark.cancel",
		title: "Cancel bookmark",
		kind: "ui",
		hidden: true,
		run(session) {
			closeBookmark(session)
		},
	},
	// Undo/redo and the shared list overlay (`u` history, `⇧T` trash). The
	// journal records reversible operations (see core/operations); the overlay
	// is one modal list whose rows/actions depend on the active mode.
	{
		id: "history.undo",
		title: "Undo",
		keys: "^Z",
		kind: "ui",
		bar: true,
		async run(session) {
			const entry = await session.journal.undo(session)
			if (!entry) {
				session.notice.set({ kind: "warning", text: "nothing to undo" })
				return
			}
			await refreshPanes(session)
			session.notice.set({ kind: "tip", text: `undid ${entry.label}` })
		},
	},
	{
		id: "history.redo",
		title: "Redo",
		keys: "^⇧Z",
		kind: "ui",
		bar: true,
		async run(session) {
			const entry = await session.journal.redo(session)
			if (!entry) {
				session.notice.set({ kind: "warning", text: "nothing to redo" })
				return
			}
			await refreshPanes(session)
			session.notice.set({ kind: "tip", text: `redid ${entry.label}` })
		},
	},
	{
		id: "history.open",
		title: "History",
		keys: "u",
		kind: "ui",
		bar: true,
		run(session) {
			openHistory(session)
		},
	},
	{
		id: "trash.open",
		title: "Trash",
		keys: "⇧T",
		kind: "ui",
		bar: true,
		async run(session) {
			await openTrash(session)
		},
	},
	{
		id: "file.mkdir",
		title: "New directory",
		keys: "n",
		kind: "ui",
		bar: true,
		run(session) {
			// The panel opens on `mkdir` with its NAME field primed, the same
			// way `!` lands on `run`.
			openPanel(session, { name: "mkdir", focus: PANEL_FOCUS.ARGS })
		},
	},
	{
		id: "overlay.up",
		title: "Previous row",
		kind: "ui",
		hidden: true,
		run(session) {
			const rows = session.overlayItems.value
			session.overlayIndex.set(moveCursor(session.overlayIndex.value, -1, rows.length))
		},
	},
	{
		id: "overlay.down",
		title: "Next row",
		kind: "ui",
		hidden: true,
		run(session) {
			const rows = session.overlayItems.value
			session.overlayIndex.set(moveCursor(session.overlayIndex.value, 1, rows.length))
		},
	},
	{
		id: "overlay.setIndex",
		title: "Highlight row",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			if (payload?.index !== undefined) session.overlayIndex.set(Math.max(0, payload.index))
		},
	},
	{
		id: "overlay.activate",
		title: "Activate row",
		kind: "ui",
		hidden: true,
		async run(session) {
			const mode = session.overlay.value
			const rows = session.overlayItems.value
			const row = rows[clampCursor(session.overlayIndex.value, rows.length)]
			if (!row) return
			if (mode === "history") return activateHistory(session, row)
			if (mode === "trash") return activateTrash(session, row)
			return undefined
		},
	},
	{
		id: "overlay.cancel",
		title: "Close list",
		kind: "ui",
		hidden: true,
		run(session) {
			closeOverlay(session)
		},
	},
	{
		id: "list.cursor",
		title: "Select row",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			activate(session, payload?.paneId)
			const index = payload?.index ?? 0
			target.cursor.set(clampCursor(index, target.entries.value.length))
			// In the explorer the parent and preview columns are mirrors: a
			// click on one of their rows retargets the current directory
			// instead of only moving that column's cursor (see
			// `retargetFromParent` / `retargetFromPreview`). Focus stays on the
			// clicked column; the pane body's own `pane:activate` agrees.
			if (session.viewMode.value !== "explorer") return
			if (payload?.paneId === "parent") return retargetFromParent(session, target, index)
			if (payload?.paneId === "preview" && isColumnPane(session, "preview")) {
				return retargetFromPreview(session, target, index)
			}
		},
	},
	{
		id: "pane.activate",
		title: "Activate pane",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			activate(session, payload?.paneId)
		},
	},
	{
		id: "pane.setPath",
		title: "Go to path",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			// A breadcrumb click focuses its column, then lands the current
			// directory there: the auxiliary columns mirror it, so their
			// crumbs navigate the pane they follow.
			activate(session, payload?.paneId)
			return currentPane(session).navigate(payload?.path)
		},
	},
	{
		id: "view.togglePreview",
		title: "Preview",
		keys: "v",
		kind: "ui",
		bar: true,
		run(session) {
			session.showPreview.set(!session.showPreview.value)
		},
	},
	{
		id: "view.toggleViewer",
		title: "Fullscreen",
		kind: "ui",
		hidden: true,
		run(session) {
			// The fullscreen inspector overlay. `v` opens it on a narrow
			// terminal and Enter opens it on a file that cannot be edited (see
			// `openFile`); the shared App controller closes it on Esc or `v`
			// (see `components/App#createBehaviors`).
			session.viewerOpen.set(!session.viewerOpen.value)
		},
	},
	{
		id: "view.maximize",
		title: "Maximize preview",
		keys: "⇧V",
		kind: "ui",
		run(session) {
			// The inspector takes the whole pane row, or gives it back. The
			// preference cells are untouched, so the previous layout — pane
			// widths, focus and whether the preview was even shown — returns
			// untouched on the next press.
			session.previewFull.set(!session.previewFull.value)
		},
	},
	{
		id: "view.toggleMode",
		title: "Explorer view",
		keys: "t",
		kind: "ui",
		bar: true,
		run(session) {
			// Flip the workspace between the two-pane commander and the
			// three-column explorer (parent · current · preview). Focus on a
			// column that does not exist in the target mode is handed back to
			// the pane it was following (see the guard effect in the session).
			session.viewMode.set(session.viewMode.value === "explorer" ? "commander" : "explorer")
		},
	},
	{
		id: "file.open",
		title: "Open file",
		keys: "O",
		kind: "ui",
		run(session) {
			const entry = session.previewEntry.value
			if (!entry) return
			return session.os.open(entry.path)
		},
	},
	{
		id: "file.edit",
		title: "Edit file",
		keys: "E",
		kind: "ui",
		run(session) {
			const entry = session.previewEntry.value
			if (!entry || entry.isDir) {
				session.notice.set({ kind: "warning", text: "no file to edit" })
				return
			}
			// A host without an editor (the web's null adapter) reports it, the
			// same guard `openFile` uses, instead of tripping over the throw.
			if (session.os?.canEdit === false) {
				session.notice.set({ kind: "warning", text: "no editor available" })
				return
			}
			return session.os.edit(entry.path).then(() => currentPane(session).refresh())
		},
	},
	// Command panel (`:`): the one entry point, over both the CLI operations
	// and the TinyCmd actions. Lifecycle, then navigation, then draft editing,
	// then run.
	{
		id: "panel.open",
		title: "Commands",
		keys: ":",
		kind: "ui",
		bar: true,
		run(session) {
			openPanel(session)
		},
	},
	{
		id: "panel.shell",
		title: "Shell command",
		kind: "ui",
		hidden: true,
		run(session) {
			// `!` is the "run a shell command" reflex: land on the `run`
			// operation with its raw CMD field already owning the keyboard. The
			// field starts empty — `!` is a script-line alias, not part of the
			// command itself.
			openPanel(session, { name: "run", focus: PANEL_FOCUS.ARGS })
		},
	},
	{
		id: "panel.up",
		title: "Previous operation",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.panelFiltered.value.length
			session.panelOpIndex.set(moveCursor(session.panelOpIndex.value, -1, length))
		},
	},
	{
		id: "panel.down",
		title: "Next operation",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.panelFiltered.value.length
			session.panelOpIndex.set(moveCursor(session.panelOpIndex.value, 1, length))
		},
	},
	{
		id: "panel.prevArg",
		title: "Previous argument",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.panelRows.value.length
			session.panelRowIndex.set(moveCursor(session.panelRowIndex.value, -1, length))
		},
	},
	{
		id: "panel.nextArg",
		title: "Next argument",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.panelRows.value.length
			session.panelRowIndex.set(moveCursor(session.panelRowIndex.value, 1, length))
		},
	},
	{
		id: "panel.tab",
		title: "Next argument or command",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			// Tab cycles the focus ring: the command filter then each argument
			// header, wrapping at both ends (an item row is reached with the
			// arrows). Shift-Tab walks it backwards.
			const delta = payload?.delta === -1 ? -1 : 1
			const rows = session.panelRows.value
			const headers = []
			for (let i = 0; i < rows.length; i++) if (rows[i].type === "arg") headers.push(i)
			if (!headers.length) return
			if (session.panelFocus.value === PANEL_FOCUS.OPS) {
				session.panelRowIndex.set(delta > 0 ? headers[0] : headers[headers.length - 1])
				session.panelFocus.set(PANEL_FOCUS.ARGS)
				return
			}
			const at = headers.indexOf(session.panelRowIndex.value)
			if (delta > 0) {
				if (at === -1 || at >= headers.length - 1) session.panelFocus.set(PANEL_FOCUS.OPS)
				else session.panelRowIndex.set(headers[at + 1])
			} else if (at <= 0) {
				session.panelFocus.set(PANEL_FOCUS.OPS)
			} else {
				session.panelRowIndex.set(headers[at - 1])
			}
		},
	},
	{
		id: "panel.setQuery",
		title: "Filter commands",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			session.panelQuery.set(`${payload?.query ?? ""}`)
		},
	},
	{
		id: "panel.type",
		title: "Type into the command filter",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			// A key pressed while a non-textual argument owns the cursor jumps
			// back to the command column and edits the filter.
			const query = `${session.panelQuery.value ?? ""}`
			session.panelQuery.set(payload?.backspace ? query.slice(0, -1) : `${query}${payload?.char ?? ""}`)
			session.panelFocus.set(PANEL_FOCUS.OPS)
		},
	},
	{
		id: "panel.setRow",
		title: "Highlight argument",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			if (payload?.index !== undefined) session.panelRowIndex.set(Math.max(0, payload.index))
		},
	},
	{
		id: "panel.setOp",
		title: "Select operation",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			// Selecting an operation (a click) moves the cursor without
			// stealing focus from the command filter.
			if (payload?.index !== undefined) session.panelOpIndex.set(Math.max(0, payload.index))
		},
	},
	{
		id: "panel.focusArg",
		title: "Focus arguments",
		kind: "ui",
		hidden: true,
		run(session) {
			// A click on an argument focuses the argument column.
			session.panelFocus.set(PANEL_FOCUS.ARGS)
		},
	},
	{
		id: "panel.toggleItem",
		title: "Toggle argument item",
		kind: "ui",
		hidden: true,
		run(session) {
			const row = rowAt(session.panelRows.value, session.panelRowIndex.value)
			if (!row) return
			const draft = session.panelDraft.value
			if (row.type === "item") {
				session.panelDraft.set(withToggledItem(draft, row.argIndex, row.itemIndex, row.multi !== false))
				return
			}
			// An argument header toggles its whole selection: select all when
			// some are off, clear when all are on. A single-path argument is a
			// radio list, so its header has nothing to toggle.
			const binding = bindingAt(draft, row.argIndex)
			if (!binding || binding.kind !== "selection" || binding.multi !== true) return
			const all = (binding.items ?? []).length > 0 && (binding.items ?? []).every((item) => item.selected)
			const items = (binding.items ?? []).map((item) => ({ ...item, selected: !all }))
			session.panelDraft.set(draft.map((b) => (b.index === row.argIndex ? { ...b, items } : b)))
		},
	},
	// File picker: a sub-mode of the panel that browses the filesystem for a
	// path/destination argument. Lifecycle then navigation then choose.
	{
		id: "panel.browse",
		title: "Browse for a path",
		kind: "ui",
		hidden: true,
		run(session) {
			// Browse the focused argument when it is pickable, else the first
			// pickable argument of the operation; a no-op when there is none.
			const focused = focusedBinding(session)
			const binding = focused?.picker === true ? focused : firstPickableBinding(session)
			if (!binding) return undefined
			return openPicker(session, binding.index, binding)
		},
	},
	{
		id: "panel.pick.up",
		title: "Previous picker row",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.pickerRows.value.length
			session.panelRowIndex.set(moveCursor(session.panelRowIndex.value, -1, length))
		},
	},
	{
		id: "panel.pick.down",
		title: "Next picker row",
		kind: "ui",
		hidden: true,
		run(session) {
			const length = session.pickerRows.value.length
			session.panelRowIndex.set(moveCursor(session.panelRowIndex.value, 1, length))
		},
	},
	{
		id: "panel.pick.setCursor",
		title: "Highlight picker row",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			if (payload?.index !== undefined) session.panelRowIndex.set(Math.max(0, payload.index))
		},
	},
	{
		id: "panel.pick.enter",
		title: "Choose picker row",
		kind: "ui",
		hidden: true,
		run(session) {
			const entry = pickerEntry(session)
			if (!entry) return undefined
			// A directory descends unless this is a destination picker, where
			// every row is already a valid choice.
			if (entry.isDir && session.panelPickerMode.value !== "dir") {
				return descendPicker(session, entry.path)
			}
			return choosePicker(session, entry.path)
		},
	},
	{
		id: "panel.pick.descend",
		title: "Open the picker's directory",
		kind: "ui",
		hidden: true,
		run(session) {
			const entry = pickerEntry(session)
			if (entry?.isDir) return descendPicker(session, entry.path)
			return undefined
		},
	},
	{
		id: "panel.pick.parent",
		title: "Picker parent directory",
		kind: "ui",
		hidden: true,
		async run(session) {
			session.pickerQuery.set("")
			await session.pickerPane.up()
			session.panelRowIndex.set(0)
		},
	},
	{
		id: "panel.pick.chooseDir",
		title: "Choose the picker's directory",
		kind: "ui",
		hidden: true,
		run(session) {
			return choosePicker(session, session.pickerPane.path.value)
		},
	},
	{
		id: "panel.pick.cancel",
		title: "Leave the picker",
		kind: "ui",
		hidden: true,
		run(session) {
			// Back to the argument column, panel still open.
			session.panelPicking.set(false)
			session.panelPickerArg.set(-1)
			session.panelFocus.set(PANEL_FOCUS.ARGS)
			session.panelRowIndex.set(0)
		},
	},
	{
		id: "panel.run",
		title: "Run command",
		kind: "ui",
		hidden: true,
		async run(session) {
			const entry = session.panelEntry.value
			if (!entry) return
			const op = entry.op
			const draft = session.panelDraft.value
			// An incomplete command does not fail: a blank destination/path
			// asks where to (the picker opens and the run resumes on a choice —
			// explorer mode has no DST pane to default from), and any other
			// missing argument just takes the cursor, so Enter walks the
			// command field by field.
			const missing = missingBinding(draft)
			if (missing) {
				if (missing.kind === "dest" || missing.kind === "path") {
					session.panelPendingRun.set(true)
					return openPicker(session, missing.index, missing)
				}
				focusBinding(session, missing)
				return
			}
			const status = await runOperation(session, op, argvFor(draft))
			// A confirm keeps the panel open until the user answers; a run
			// closes it. Errors stay open so the draft can be fixed.
			if (status === "ran") closePanel(session)
		},
	},
	{
		id: "panel.cancel",
		title: "Close command panel",
		kind: "ui",
		hidden: true,
		run(session) {
			closePanel(session)
		},
	},
	{
		id: "filter.start",
		title: "Filter",
		keys: "/",
		kind: "ui",
		bar: true,
		run(session) {
			// A column with no filter field (the inspector, or a column the
			// current mode does not show) hands focus to the pane it follows
			// before the input starts capturing keystrokes.
			if (!hasFilterField(session, session.active.value)) activate(session, session.currentId.value)
			session.filtering.set(session.active.value)
		},
	},
	{
		id: "filter.accept",
		title: "Keep filter",
		kind: "ui",
		hidden: true,
		run(session) {
			session.filtering.set(null)
		},
	},
	{
		id: "filter.clear",
		title: "Clear filter",
		kind: "ui",
		hidden: true,
		run(session) {
			pane(session).clearFilter()
			session.filtering.set(null)
		},
	},
	{
		id: "confirm.yes",
		title: "Confirm",
		kind: "ui",
		hidden: true,
		run(session) {
			const pending = session.confirm.value
			if (!pending) return
			session.confirm.set(null)
			if (pending.op) {
				const op = getOperation(pending.op)
				if (!op) return null
				// A panel-originated confirm re-runs its draft and, on success,
				// closes the panel that was waiting on it.
				return runOperation(session, op, pending.args, { confirmed: true }).then((status) => {
					if (status === "ran" && session.panelOpen?.value) closePanel(session)
					return status
				})
			}
			return runLine(session, pending.line, { confirmed: true })
		},
	},
	{
		id: "confirm.no",
		title: "Cancel",
		kind: "ui",
		hidden: true,
		run(session) {
			session.confirm.set(null)
		},
	},
	// Quit: presentation-only. The key path intercepts `app.quit` before
	// dispatch, and the command-bar click does the same (the renderer owns
	// exiting); the registry entry exists so the bar and the `?` reference
	// can advertise it. Hidden from the panel, where it could only no-op.
	{
		id: "app.quit",
		title: "Quit",
		keys: "q",
		kind: "ui",
		bar: true,
		hidden: true,
		run() {},
	},
	// Help: presentation-only too. Each renderer intercepts `?` and owns its
	// own overlay cell, and routes a bar click the same way; the registry entry
	// exists so the bar and the `?` reference can advertise it. Hidden from the
	// panel, where it could only no-op.
	{
		id: "app.help",
		title: "Help",
		keys: "?",
		kind: "ui",
		bar: true,
		hidden: true,
		run() {},
	},
]

// Function: getCommands
// The full command registry.
function getCommands() {
	return commands
}

// Function: getCommand
// Looks up a command by id.
function getCommand(id) {
	for (let i = 0; i < commands.length; i++) {
		if (commands[i].id === id) return commands[i]
	}
	return null
}

// Function: getCommandBarItems
// Command-bar rows for the current context: the panel's key hints while it is
// open, the filter hints while a pane filter is capturing input, the bookmark
// hints while the picker owns the keyboard, the held modifier's chords (see
// `getModifierBarItems`), the `bar`-flagged UI commands otherwise (keymap
// order). Takes the context as named fields — four adjacent flags are too easy
// to transpose.
function getCommandBarItems({ filtering, bookmarkOpen, bookmarkMode, panelOpen, panelPicking, overlay, modifier }) {
	if (panelOpen) return panelPicking ? PANEL_PICK_KEYS : PANEL_HINT_KEYS
	if (bookmarkOpen) return bookmarkMode === "name" ? BOOKMARK_NAME_KEYS : BOOKMARK_LIST_KEYS
	if (overlay === "history") return HISTORY_KEYS
	if (overlay === "trash") return TRASH_KEYS
	if (filtering) return FILTER_KEYS
	if (modifier) return getModifierBarItems(modifier)
	return commands.filter((command) => command.bar).map(barRow)
}

// Function: getModifierBarItems
// The hints revealed while a modifier ("shift"/"ctrl") is held: every command
// bound under it in the keymap, in binding order, rendered like the bar's own
// entries, with the `?` reference trailing. The help overlay is
// presentation-only (each renderer intercepts `?` and owns its own cell), so it
// is appended by hand rather than looked up through the keymap.
function getModifierBarItems(modifier) {
	const byId = new Map(commands.map((command) => [command.id, command]))
	const rows = []
	const rowsById = new Map()
	for (const binding of DEFAULT_KEYMAP) {
		if (!binding[modifier]) continue
		const command = byId.get(binding.command)
		if (!command) continue
		const chord = keyGlyph(binding)
		const row = rowsById.get(binding.command)
		if (row) {
			if (!row.keys.split("/").includes(chord)) row.keys += `/${chord}`
		} else {
			const item = { ...barRow(command), keys: chord }
			rowsById.set(binding.command, item)
			rows.push(item)
		}
	}
	const help = byId.get("app.help")
	if (help && !rowsById.has("app.help")) rows.push(barRow(help))
	return rows
}

// Function: barRow
// Projects a command to the small row object the command bar renders.
function barRow(command) {
	return {
		id: command.id,
		title: command.title,
		keys: command.keys,
		primary: command.primary === true,
	}
}

// Function: createDispatch
// Returns `dispatch(id, payload)` bound to the session. Unknown and `app.*`
// (presentation-only) commands are ignored here. Failures (sync throws and
// rejections) land on the active pane's error cell and the session notice.
function createDispatch(session) {
	return (id, payload) => {
		const command = getCommand(id)
		if (!command) return null
		session.notice?.set(null)
		try {
			return Promise.resolve(command.run(session, payload)).catch((error) => fail(session, error))
		} catch (error) {
			return fail(session, error)
		}
	}
}

function fail(session, error) {
	const message = `${error?.message ?? error}`
	pane(session).error.set(message)
	session.notice?.set({ kind: "error", text: message })
	return null
}

// Function: isColumnPane
// Whether the focused column is backed by a rendered pane. The parent column
// only exists in explorer mode (focus is handed back on leaving it); the
// inspector column only while it previews a directory — over a file it is a
// read-only card with no listing to drive.
function isColumnPane(session, paneId) {
	if (paneId !== "preview") return paneId !== "parent" || session.viewMode.value === "explorer"
	return Boolean(session.showPreview.value) && Boolean(session.previewEntry.value?.isDir) && !session.preview.value
}

// Function: hasFilterField
// Whether the focused column renders a filter input. The inspector column
// never does — its header is the preview title — so `/` hands focus to the
// pane it shows before capturing keystrokes, the same way a nav key falls
// back to it.
function hasFilterField(session, paneId) {
	return paneId !== "preview" && isColumnPane(session, paneId)
}

// Function: pane
// The pane cursor movement, marks and reload act on: the focused column's
// pane when it has one, else the current pane (so the inspector over a file
// keeps scrolling the directory it is showing).
function pane(session) {
	const focused = session.panes[session.active.value]
	if (!focused || !isColumnPane(session, session.active.value)) return currentPane(session)
	return focused
}

// Function: activate
// Makes `paneId` the active pane (no-op for unknown ids or when already
// active). Clicks on rows, crumbs, tabs and pane bodies all route here.
function activate(session, paneId) {
	if (!paneId || !session.panes[paneId]) return
	if (session.active.value !== paneId) session.active.set(paneId)
}

// Function: retargetFromParent
// A click on a row of the explorer's parent column retargets the current
// directory: a directory becomes it, a file opens its containing directory
// with the file selected so the inspector previews it. Both moves are
// recorded, so Esc steps back to where the click came from.
function retargetFromParent(session, parent, index) {
	const entries = parent.entries.value
	const entry = entries[clampCursor(index, entries.length)]
	if (!entry) return
	const current = currentPane(session)
	if (entry.isDir) return current.navigate(entry.path)
	return current
		.navigate(parent.path.value, { cursorPath: entry.path })
		.then(() => pinPreview(session, current))
}

// Function: retargetFromPreview
// A click on a row of the explorer's preview column promotes the previewed
// directory to the current one, selecting the clicked entry: a directory then
// previews its own contents (the next click descends further), a file previews
// as a card.
function retargetFromPreview(session, preview, index) {
	const entries = preview.entries.value
	const entry = entries[clampCursor(index, entries.length)]
	if (!entry) return
	const current = currentPane(session)
	return current.navigate(preview.path.value, { cursorPath: entry.path }).then(() => {
		if (!entry.isDir) pinPreview(session, current)
	})
}

// Function: pinPreview
// Points the inspector at the pane's cursor entry, so a file a click just
// revealed previews even if the follow effect lags the navigation.
function pinPreview(session, pane) {
	session.previewTarget.set(pane.currentEntry() ?? null)
	session.showPreview.set(true)
}

// Function: openFile
// Enter on a file. A text file the host can edit opens in `$EDITOR` and the
// pane is refreshed afterwards (an editor may have rewritten it); anything else
// — an image, media, a binary body, or any file on a host without an editor
// (the web) — opens the fullscreen inspector instead.
async function openFile(session, current, entry) {
	if (await isEditable(session, entry)) {
		await session.os.edit(entry.path)
		await current.refresh()
		return
	}
	session.previewTarget.set(entry)
	session.showPreview.set(true)
	session.viewerOpen.set(true)
}

// Function: isEditable
// Whether Enter edits `entry` rather than previewing it: the host must have an
// editor, the entry must preview as text (not an image/media card) and its head
// must not be binary. The read follows symlinks, like the inspector's own, and
// needs only the sniff window `hasBinaryByte` looks at.
async function isEditable(session, entry) {
	if (entry?.isDir) return false
	if (session.os?.canEdit === false) return false
	if (previewKind(entry?.ext) !== "text") return false
	const head = await session.fs.readTextHead(entry.path, SNIFF_BYTES).catch(() => null)
	return head !== null && !hasBinaryByte(head)
}

function bump(session, delta) {
	const p = pane(session)
	p.cursor.set(moveCursor(p.cursor.value, delta, p.entries.value.length))
}

function moveBookmark(session, delta) {
	const length = session.bookmarkItems.value.length
	session.bookmarkIndex.set(moveCursor(session.bookmarkIndex.value, delta, length))
}

function closeBookmark(session) {
	session.bookmarkOpen.set(false)
}

// Function: openHistory
// Opens the history overlay: one row per journal entry, the cursor parked on
// the current position. A row carries its journal `index` so activating it can
// rewind/replay to that point.
function openHistory(session) {
	const rows = session.journal.rows()
	session.overlayItems.set(
		rows.map((row) => ({
			key: `h:${row.id}`,
			text: row.label,
			meta: row.applied ? (row.current ? "current" : "applied") : "undone",
			index: row.index,
			current: row.current,
			dim: !row.applied,
		})),
	)
	const current = rows.findIndex((row) => row.current)
	session.overlayIndex.set(current >= 0 ? current : 0)
	session.overlay.set("history")
}

// Function: openTrash
// Opens the trash overlay on the current trash listing.
async function openTrash(session) {
	await loadTrash(session)
	session.overlayIndex.set(0)
	session.overlay.set("trash")
}

// Function: loadTrash
// Refreshes the overlay rows from the trash listing. A row's key is its trash
// path (`fs.restore` addresses entries by it) and its meta the original path.
async function loadTrash(session) {
	const rows = (await session.fs.trashList?.()) ?? []
	session.overlayItems.set(
		rows.map((row) => ({
			key: row.trashPath,
			text: row.name,
			meta: row.originalPath ?? "",
			trashPath: row.trashPath,
			dim: false,
		})),
	)
	return rows
}

// Function: activateHistory
// Rewinds or replays the journal to `row.index`, refreshes the panes and closes
// the overlay.
async function activateHistory(session, row) {
	await session.journal.goTo(session, row.index)
	await refreshPanes(session)
	closeOverlay(session)
	session.notice.set({ kind: "tip", text: `history → ${row.text}` })
}

// Function: activateTrash
// Restores the trashed entry under the cursor, refreshes the trash list (the
// restored row is gone), the panes and closes nothing (the panel stays open so
// several entries can be restored in a row).
async function activateTrash(session, row) {
	await session.fs.restore([row.trashPath])
	await loadTrash(session)
	session.overlayIndex.set(clampCursor(session.overlayIndex.value, session.overlayItems.value.length))
	await refreshPanes(session)
	session.notice.set({ kind: "tip", text: `restored ${row.meta || row.text}` })
}

// Function: closeOverlay
function closeOverlay(session) {
	session.overlay.set(null)
}

// Function: focusedBinding
// The draft binding under the right pane's cursor (an argument header or one
// of its item rows), or null on the command filter.
function focusedBinding(session) {
	if (session.panelFocus.value !== PANEL_FOCUS.ARGS) return null
	const row = rowAt(session.panelRows.value, session.panelRowIndex.value)
	return row ? bindingAt(session.panelDraft.value, row.argIndex) : null
}

// Function: firstPickableBinding
// The first browsable (`picker`) binding of the draft, so `^O` works from the
// command filter too.
function firstPickableBinding(session) {
	return (session.panelDraft.value ?? []).find((binding) => binding.picker === true) ?? null
}

// Function: focusBinding
// Moves the cursor onto the argument header row of the binding Enter found
// missing.
function focusBinding(session, binding) {
	const rowIndex = (session.panelRows.value ?? []).findIndex(
		(row) => row.type === "arg" && row.argIndex === binding.index,
	)
	session.panelFocus.set(PANEL_FOCUS.ARGS)
	session.panelRowIndex.set(rowIndex >= 0 ? rowIndex : 0)
}

// Function: openPanel
// Opens the command panel fresh: empty query, first entry selected, the entry
// column focused. `options.name` selects a CLI operation by name — `!` lands on
// `run` — and `options.focus` moves the focus ring to the argument column so a
// raw or literal argument owns the keyboard right away.
function openPanel(session, options = {}) {
	session.panelQuery.set("")
	session.panelOpIndex.set(0)
	session.panelRowIndex.set(0)
	session.panelFocus.set(PANEL_FOCUS.OPS)
	session.panelPicking.set(false)
	session.panelPickerArg.set(-1)
	session.panelPendingRun.set(false)
	session.panelOpen.set(true)
	if (!options.name) return
	// Select the operation by index rather than by query, so the filter stays
	// empty and the list keeps its full ordering. A missing name is a bug in
	// the caller (a renamed operation), not something to silently paper over by
	// landing on the first entry.
	const index = session.panelFiltered.value.findIndex((entry) => entry.name === options.name)
	if (index < 0) throw new Error(`command panel has no entry named "${options.name}"`)
	session.panelOpIndex.set(index)
	if (options.focus === PANEL_FOCUS.ARGS) {
		session.panelFocus.set(PANEL_FOCUS.ARGS)
		session.panelRowIndex.set(0)
	}
}

// Function: pickerEntry
// The entry under the picker cursor, or null (empty listing / stale cursor).
function pickerEntry(session) {
	const rows = session.pickerRows.value
	return rows[clampCursor(session.panelRowIndex.value, rows.length)] ?? null
}

// Function: openPicker
// Opens the panel's file picker on a path argument: the argument column
// switches to a browsable listing seated on the argument's current value (a
// directory opens there, a file opens in its parent with the file under the
// cursor), else on the current pane's directory. Focus moves to the argument
// column so the picker's own input owns the keyboard.
async function openPicker(session, argIndex, binding) {
	const mode = binding?.mode ?? "dir"
	session.panelPickerMode.set(mode)
	session.panelPickerArg.set(argIndex)
	session.pickerQuery.set("")
	session.panelPicking.set(true)
	session.panelFocus.set(PANEL_FOCUS.ARGS)
	let startPath = currentPane(session)?.path?.value ?? session.fs.cwd?.() ?? "/"
	let cursorPath = null
	const value = `${binding?.value ?? ""}`.trim()
	if (value) {
		const stats = await session.fs.stat(value)
		if (stats?.isDir) startPath = value
		else {
			startPath = parentOf(value) ?? "/"
			cursorPath = value
		}
	}
	await session.pickerPane.navigate(startPath, { record: false, cursorPath })
	const rows = session.pickerRows.value
	const index = cursorPath ? rows.findIndex((row) => row.path === cursorPath) : -1
	session.panelRowIndex.set(index >= 0 ? index : 0)
}

// Function: descendPicker
// Moves the picker into `path`, clearing its filter and re-anchoring the
// cursor at the top of the fresh listing.
async function descendPicker(session, path) {
	if (!path) return undefined
	session.pickerQuery.set("")
	await session.pickerPane.navigate(path, { record: false })
	session.panelRowIndex.set(0)
	return undefined
}

// Function: choosePicker
// Accepts `path` as the picked value: writes it into the argument, leaves the
// picker (the panel stays open on the argument column) and, when the picker was
// opened to satisfy a pending run, runs the operation now.
function choosePicker(session, path) {
	if (path == null) return undefined
	const argIndex = session.panelPickerArg.value
	session.panelDraft.set(withArgValue(session.panelDraft.value, argIndex, path))
	session.panelPicking.set(false)
	session.panelPickerArg.set(-1)
	session.panelFocus.set(PANEL_FOCUS.ARGS)
	const rows = session.panelRows.value
	const index = rows.findIndex((row) => row.type === "arg" && row.argIndex === argIndex)
	session.panelRowIndex.set(index >= 0 ? index : 0)
	if (session.panelPendingRun.value) {
		session.panelPendingRun.set(false)
		return session.dispatch("panel.run")
	}
	return undefined
}

function closePanel(session) {
	session.panelOpen.set(false)
}

export {
	barRow,
	closePanel,
	createDispatch,
	getCommand,
	getCommandBarItems,
	getCommands,
	getModifierBarItems,
	openPanel,
}
