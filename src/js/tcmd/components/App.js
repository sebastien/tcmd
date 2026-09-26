// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/App
// Root component: two panes (breadcrumbs + FileList + summary each), a
// toolbar, an optional preview column and the command palette overlay. App is
// the controller seam: component events (published bubbles) and key chords are
// translated into `session.dispatch(commandId, payload)` calls; it never
// mutates model state directly.
//
// Environment: `accentFg`, `borderFg`, `errorFg`, `normalizeKey(event)`,
// `quit(self)`.

import { DEFAULT_KEYMAP, matchKeymap } from "../core/keymap.js"
import { read } from "./read.js"

// Function: createInit
// State initializer binding the root component to a `session`.
function createInit(session) {
	const left = session.panes.left
	const right = session.panes.right
	return () => ({
		active: session.active,
		commandRows: session.commandsCell,
		dispatch: session.dispatch,
		leftCursor: left.cursor,
		leftDisk: left.disk,
		leftEntries: left.entries,
		leftError: left.error,
		leftId: "left",
		leftMarked: left.marked,
		leftSegments: left.segments,
		paletteIndex: session.paletteIndex,
		paletteItems: session.paletteItems,
		paletteOpen: session.paletteOpen,
		paletteQuery: session.paletteQuery,
		preview: session.preview,
		rightCursor: right.cursor,
		rightDisk: right.disk,
		rightEntries: right.entries,
		rightError: right.error,
		rightId: "right",
		rightMarked: right.marked,
		rightSegments: right.segments,
		showPreview: session.showPreview,
	})
}

// Function: createBehaviors
// Builds the App data/key behavior map for the given renderer environment.
// Published events are registered separately via `createEvents()` (`.sub`).
function createBehaviors(env) {
	return {
		leftBorderFg: (_self, data) => (read(data.active) === "left" ? env.accentFg : env.borderFg),
		// Global key handling: palette mode first, then the keymap.
		keys: (self, data, event) => {
			const key = env.normalizeKey(event)
			if (read(data.paletteOpen)) {
				if (key?.name === "escape") {
					data.dispatch("palette.toggle")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					self.pub("palette:confirm", `${read(data.paletteQuery) ?? ""}`)
					return
				}
				// Let the focused input handle typing.
				return
			}
			const id = matchKeymap(DEFAULT_KEYMAP, key)
			if (!id) return
			if (id === "app.quit") {
				env.quit(self)
				return
			}
			data.dispatch(id, { paneId: read(data.active) })
		},
		rightBorderFg: (_self, data) => (read(data.active) === "right" ? env.accentFg : env.borderFg),
		status: (_self, data) => {
			const error = read(data.leftError) ?? read(data.rightError)
			return error ? `error: ${error}` : ""
		},
		statusFg: () => env.errorFg,
	}
}

// Function: createEvents
// App event subscriptions, registered with `.sub(...)`. Handlers receive
// `(self, data, event)` with the published payload in `event.data`.
function createEvents() {
	return {
		"crumbs:go": (self, _data, event) => self.data.dispatch("pane.setPath", event.data),
		"list:select": (self, _data, event) => self.data.dispatch("list.cursor", event.data),
		"palette:confirm": (self, _data, event) => {
			const data = self.data
			// The global key handler and the input's on:enter can both fire;
			// only the first one (while the palette is open) acts.
			if (!read(data.paletteOpen)) return
			const items = read(data.paletteItems) ?? []
			const query = `${event.data ?? ""}`
			const match =
				items.find((item) => item.title.toLowerCase().includes(query.toLowerCase())) ??
				items[0]
			if (match) data.dispatch(match.id)
			data.dispatch("palette.toggle")
		},
		"palette:run": (self, _data, event) => {
			self.data.dispatch(event.data)
			self.data.dispatch("palette.toggle")
		},
		"toolbar:run": (self, _data, event) => self.data.dispatch(event.data),
	}
}

export { createBehaviors, createEvents, createInit }
