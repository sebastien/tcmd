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

import { clampCursor, moveCursor } from "./selection.js"
import { runLine } from "./script.js"

const PAGE = 10

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
		id: "pane.reload",
		title: "Reload",
		keys: "^R",
		kind: "ui",
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
		id: "tab.new",
		title: "New tab",
		keys: "t",
		kind: "ui",
		bar: true,
		run(session) {
			return pane(session).addTab()
		},
	},
	{
		id: "tab.close",
		title: "Close tab",
		keys: "^W",
		kind: "ui",
		run(session) {
			pane(session).closeTab()
		},
	},
	{
		id: "tab.next",
		title: "Next tab",
		keys: "]",
		kind: "ui",
		run(session) {
			pane(session).nextTab()
		},
	},
	{
		id: "tab.prev",
		title: "Previous tab",
		keys: "[",
		kind: "ui",
		run(session) {
			pane(session).prevTab()
		},
	},
	{
		id: "tab.select",
		title: "Select tab",
		kind: "ui",
		hidden: true,
		run(session, payload) {
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			activate(session, payload?.paneId)
			target.selectTab(payload?.index ?? 0)
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
		keys: ":",
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
function getCommandBarItems(paletteOpen, paletteMode, filtering) {
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
