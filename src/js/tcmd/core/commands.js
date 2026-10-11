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
// - `kind`: "ui" for UI-level actions; the command palette lists UI actions by
//   default (scripting operations live in core/operations.js).
// - `bar`: true when the command appears in the command bar's key hints.
// - `hidden`: true for internal commands that never show in the palette.

import { basename, parent as parentOf } from "./path.js"
import { PANEL_FOCUS, argvFor, bindingAt, missingArg, rowAt, withToggledItem } from "./panel.js"
import { clampCursor, moveCursor } from "./selection.js"
import { runLine } from "./script.js"
import { getOperation, runOperation } from "./operations.js"

// Constant: PAGE / JUMP
// Cursor movement steps: a page for PgUp/PgDn, a shorter jump for the
// ctrl-arrow accelerators.
const PAGE = 10
const JUMP = 5

// Function: PALETTE_KEYS
// Command-bar hints shown while the command palette is open.
const PALETTE_KEYS = [
	{ id: null, title: "Navigate", keys: "↑/↓" },
	{ id: null, title: "Complete", keys: "Tab" },
	{ id: null, title: "Run", keys: "Enter", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

// Constant: SCRIPT_KEYS
// Command-bar hints for scripting mode (no UI navigation, only the palette
// itself).
const SCRIPT_KEYS = [
	{ id: null, title: "Complete", keys: "Tab" },
	{ id: null, title: "Run", keys: "Enter", primary: true },
	{ id: null, title: "Close", keys: "Esc" },
]

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
	{ id: null, title: "Toggle", keys: "Spc" },
	{ id: null, title: "Run", keys: "↵", primary: true },
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
			return pane(session).open()
		},
	},
	{
		id: "pane.up",
		title: "Parent",
		keys: "←",
		kind: "ui",
		bar: true,
		run(session) {
			return pane(session).up()
		},
	},
	{
		id: "pane.back",
		title: "Back",
		keys: "Esc",
		kind: "ui",
		run(session) {
			return pane(session).back()
		},
	},
	{
		id: "pane.forward",
		title: "Forward",
		keys: "⇧Esc",
		kind: "ui",
		run(session) {
			return pane(session).forward()
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
			session.active.set(session.active.value === "left" ? "right" : "left")
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
			const target = session.panes[session.active.value]
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
	{
		id: "list.cursor",
		title: "Set cursor",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			activate(session, payload?.paneId)
			target.cursor.set(clampCursor(payload?.index ?? 0, target.entries.value.length))
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
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			activate(session, payload?.paneId)
			return target.navigate(payload?.path)
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
			return session.os.edit(entry.path).then(() => session.panes[session.active.value].refresh())
		},
	},
	// Command panel (`:`/`m`): the structured Commando view over the
	// operations. Lifecycle, then navigation, then draft editing, then run.
	{
		id: "panel.toggle",
		title: "Commands",
		keys: "m",
		kind: "ui",
		bar: true,
		run(session) {
			togglePanel(session)
		},
	},
	{
		id: "panel.open",
		title: "Commands",
		keys: ":",
		kind: "ui",
		hidden: true,
		run(session) {
			// `:` is the natural "command" key: open the structured panel on
			// renderers that have it, and fall back to the flat script palette
			// on those that do not (the web view).
			if (!session.panelEnabled?.value) {
				openPalette(session, "script", "")
				return
			}
			openPanel(session)
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
			// Tab cycles the focus ring: the command (query) then each argument
			// header, wrapping at both ends. Shift-Tab walks it backwards.
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
				session.panelDraft.set(withToggledItem(draft, row.argIndex, row.itemIndex))
				return
			}
			// An argument header toggles its whole selection: select all when
			// some are off, clear when all are on.
			const binding = bindingAt(draft, row.argIndex)
			if (!binding || binding.kind !== "selection") return
			const all = (binding.items ?? []).length > 0 && (binding.items ?? []).every((item) => item.selected)
			const items = (binding.items ?? []).map((item) => ({ ...item, selected: !all }))
			session.panelDraft.set(draft.map((b) => (b.index === row.argIndex ? { ...b, items } : b)))
		},
	},
	{
		id: "panel.run",
		title: "Run command",
		kind: "ui",
		hidden: true,
		async run(session) {
			const op = session.panelOperation.value
			if (!op) return
			// An unrunnable draft is refused with the missing argument's name —
			// the `«NAME»` the preview already flags — instead of the generic
			// usage error `runOperation` would produce.
			const missing = missingArg(session.panelDraft.value)
			if (missing) {
				session.notice.set({ kind: "error", text: `${op.name}: fill in «${missing}»` })
				return
			}
			const status = await runOperation(session, op, argvFor(session.panelDraft.value))
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
		id: "palette.toggle",
		title: "Palette",
		keys: "^P",
		kind: "ui",
		bar: true,
		run(session) {
			if (session.paletteOpen.value) {
				closePalette(session)
				return
			}
			openPalette(session, "ui", "")
		},
	},
	{
		id: "palette.script",
		title: "Script",
		kind: "ui",
		run(session) {
			openPalette(session, "script", "")
		},
	},
	{
		id: "palette.run",
		title: "Run command",
		keys: "!",
		kind: "ui",
		run(session) {
			openPalette(session, "script", "!")
		},
	},
	{
		id: "filter.start",
		title: "Filter",
		keys: "/",
		kind: "ui",
		bar: true,
		run(session) {
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
		id: "palette.up",
		title: "Previous command",
		kind: "ui",
		hidden: true,
		run(session) {
			movePalette(session, -1)
		},
	},
	{
		id: "palette.down",
		title: "Next command",
		kind: "ui",
		hidden: true,
		run(session) {
			movePalette(session, 1)
		},
	},
	{
		id: "palette.complete",
		title: "Complete",
		kind: "ui",
		hidden: true,
		run(session) {
			const items = session.paletteItems.value
			const item = items[clampCursor(session.paletteIndex.value, items.length)]
			if (item?.completion) session.paletteQuery.set(item.completion)
		},
	},
	{
		id: "palette.setQuery",
		title: "Set palette query",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			session.paletteQuery.set(`${payload?.query ?? ""}`)
		},
	},
	{
		id: "palette.submit",
		title: "Submit palette",
		kind: "ui",
		hidden: true,
		run(session) {
			const query = `${session.paletteQuery.value ?? ""}`.trim()
			if (!query) {
				// Nothing to run: complete the highlighted row instead.
				const items = session.paletteItems.value
				const item = items[clampCursor(session.paletteIndex.value, items.length)]
				if (item?.completion) session.paletteQuery.set(item.completion)
				return
			}
			return runLine(session, query).then((status) => {
				if (status !== "empty") closePalette(session)
				return status
			})
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
	// can advertise it. Hidden from the palette, where it could only no-op.
	{
		id: "app.quit",
		title: "Quit",
		keys: "q",
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

// Function: getPaletteCommands
// Commands the command palette lists in UI mode: user-visible UI actions.
function getPaletteCommands() {
	return commands.filter((command) => !command.hidden && (command.kind ?? "ui") === "ui")
}

// Function: getCommandBarItems
// Command-bar rows for the current context: the palette's key hints while it
// is open (scripting mode has its own), the filter hints while a pane filter is
// capturing input, the `bar`-flagged UI commands otherwise (keymap order).
function getCommandBarItems(paletteOpen, paletteMode, filtering, bookmarkOpen, bookmarkMode, panelOpen) {
	if (panelOpen) return PANEL_HINT_KEYS
	if (bookmarkOpen) return bookmarkMode === "name" ? BOOKMARK_NAME_KEYS : BOOKMARK_LIST_KEYS
	if (paletteOpen) return paletteMode === "script" ? SCRIPT_KEYS : PALETTE_KEYS
	if (filtering) return FILTER_KEYS
	return commands.filter((command) => command.bar).map(commandRow)
}

// Function: commandRow
// Projects a command to the small row object views render.
function commandRow(command) {
	return {
		id: command.id,
		title: command.title,
		keys: command.keys,
		kind: command.kind ?? "ui",
		primary: command.primary === true,
		completion: command.completion ?? command.title,
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

function pane(session) {
	return session.panes[session.active.value]
}

// Function: activate
// Makes `paneId` the active pane (no-op for unknown ids or when already
// active). Clicks on rows, crumbs, tabs and pane bodies all route here.
function activate(session, paneId) {
	if (!paneId || !session.panes[paneId]) return
	if (session.active.value !== paneId) session.active.set(paneId)
}

function bump(session, delta) {
	const p = pane(session)
	p.cursor.set(moveCursor(p.cursor.value, delta, p.entries.value.length))
}

function movePalette(session, delta) {
	const length = session.paletteItems.value.length
	session.paletteIndex.set(moveCursor(session.paletteIndex.value, delta, length))
}

function moveBookmark(session, delta) {
	const length = session.bookmarkItems.value.length
	session.bookmarkIndex.set(moveCursor(session.bookmarkIndex.value, delta, length))
}

function closeBookmark(session) {
	session.bookmarkOpen.set(false)
}

function openPanel(session) {
	session.panelQuery.set("")
	session.panelOpIndex.set(0)
	session.panelRowIndex.set(0)
	session.panelFocus.set(PANEL_FOCUS.OPS)
	session.panelOpen.set(true)
}

// Function: togglePanel
// Opens the command panel, or closes it when already open. Disabled (TUI-only)
// renderers ignore it.
function togglePanel(session) {
	if (!session.panelEnabled?.value) return
	if (session.panelOpen.value) {
		closePanel(session)
		return
	}
	openPanel(session)
}

function closePanel(session) {
	session.panelOpen.set(false)
}

function openPalette(session, mode, query) {
	session.paletteMode.set(mode)
	session.paletteQuery.set(query)
	session.paletteIndex.set(0)
	session.paletteOpen.set(true)
}

function closePalette(session) {
	session.paletteOpen.set(false)
}

export {
	commandRow,
	createDispatch,
	getCommand,
	getCommandBarItems,
	getCommands,
	getPaletteCommands,
}
