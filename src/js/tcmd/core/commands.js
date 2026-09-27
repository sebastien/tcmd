// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/commands
// Command registry and dispatch. Commands are pure operations over the
// session model: `run(session, payload)`. Views never mutate state directly —
// they call `session.dispatch(id, payload)`, keeping the model the single
// source of truth for every presentation layer.

import { clampCursor, moveCursor } from "./selection.js"

const PAGE = 10

const commands = [
	{
		id: "nav.up",
		title: "Cursor up",
		keys: "↑",
		run(session) {
			bump(session, -1)
		},
	},
	{
		id: "nav.down",
		title: "Cursor down",
		keys: "↓",
		run(session) {
			bump(session, 1)
		},
	},
	{
		id: "nav.pageUp",
		title: "Page up",
		keys: "PgUp",
		run(session) {
			bump(session, -PAGE)
		},
	},
	{
		id: "nav.pageDown",
		title: "Page down",
		keys: "PgDn",
		run(session) {
			bump(session, PAGE)
		},
	},
	{
		id: "nav.home",
		title: "First entry",
		keys: "Home",
		run(session) {
			pane(session).cursor.set(0)
		},
	},
	{
		id: "nav.end",
		title: "Last entry",
		keys: "End",
		run(session) {
			pane(session).cursor.set(Math.max(0, pane(session).entries.value.length - 1))
		},
	},
	{
		id: "pane.enter",
		title: "Open",
		keys: "Enter",
		toolbar: true,
		run(session) {
			return pane(session).open()
		},
	},
	{
		id: "pane.up",
		title: "Parent",
		keys: "←",
		toolbar: true,
		run(session) {
			return pane(session).up()
		},
	},
	{
		id: "pane.reload",
		title: "Reload",
		keys: "^R",
		run(session) {
			return pane(session).refresh()
		},
	},
	{
		id: "pane.toggle",
		title: "Switch",
		keys: "Tab",
		toolbar: true,
		run(session) {
			session.active.set(session.active.value === "left" ? "right" : "left")
		},
	},
	{
		id: "list.mark",
		title: "Mark",
		keys: "Spc",
		toolbar: true,
		run(session) {
			pane(session).toggleMark()
		},
	},
	{
		id: "list.cursor",
		title: "Set cursor",
		hidden: true,
		run(session, payload) {
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			target.cursor.set(clampCursor(payload?.index ?? 0, target.entries.value.length))
		},
	},
	{
		id: "pane.setPath",
		title: "Go to path",
		hidden: true,
		run(session, payload) {
			const target = payload?.paneId ? session.panes[payload.paneId] : pane(session)
			return target.navigate(payload?.path)
		},
	},
	{
		id: "view.togglePreview",
		title: "Preview",
		keys: "v",
		toolbar: true,
		run(session) {
			session.showPreview.set(!session.showPreview.value)
		},
	},
	{
		id: "palette.toggle",
		title: "Palette",
		keys: "^P",
		toolbar: true,
		run(session) {
			session.paletteOpen.set(!session.paletteOpen.value)
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

// Function: createDispatch
// Returns `dispatch(id, payload)` bound to the session. Unknown and `app.*`
// (presentation-only) commands are ignored here. Failures (sync throws and
// rejections) land on the active pane's error cell.
function createDispatch(session) {
	return (id, payload) => {
		const command = getCommand(id)
		if (!command) return null
		try {
			return Promise.resolve(command.run(session, payload)).catch((error) => {
				pane(session).error.set(`${error?.message ?? error}`)
			})
		} catch (error) {
			pane(session).error.set(`${error?.message ?? error}`)
			return null
		}
	}
}

function pane(session) {
	return session.panes[session.active.value]
}

function bump(session, delta) {
	const p = pane(session)
	p.cursor.set(moveCursor(p.cursor.value, delta, p.entries.value.length))
}

export { createDispatch, getCommand, getCommands }

// EOF
