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
// Environment: `normalizeKey(event)` (optional; identity when omitted) and
// `quit(self)`. Renderer-specific bindings (pane borders, status color) live in
// the per-renderer app binding.

import { unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP, matchKeymap } from "../core/keymap.js"

// Function: createInit
// State initializer binding the root component to a `session`.
function createInit(session) {
	const left = session.panes.left
	const right = session.panes.right
	return () => ({
		active: session.active,
		toolbarCommands: session.toolbarCommands,
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
		// Global key handling: palette mode first, then the keymap.
		keys: (self, data, event) => {
			const key = env.normalizeKey ? env.normalizeKey(event) : event
			if (unwrap(data.paletteOpen)) {
				if (key?.name === "escape") {
					data.dispatch("palette.toggle")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					self.pub("palette:confirm", `${unwrap(data.paletteQuery) ?? ""}`)
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
			data.dispatch(id, { paneId: unwrap(data.active) })
		},
		status: (_self, data) => {
			const error = unwrap(data.leftError) ?? unwrap(data.rightError)
			return error ? `error: ${error}` : ""
		},
	}
}

// Function: createEvents
// App event subscriptions, registered with `.sub(...)`. Handlers receive
// `(self, data, event)` with the published payload in `event.data`.
function createEvents() {
	return {
		"crumbs:go": (_self, data, event) => data.dispatch("pane.setPath", event.data),
		"list:select": (_self, data, event) => data.dispatch("list.cursor", event.data),
		"palette:confirm": (_self, data, event) => {
			// The global key handler and the input's on:enter can both fire;
			// only the first one (while the palette is open) acts.
			if (!unwrap(data.paletteOpen)) return
			const items = unwrap(data.paletteItems) ?? []
			const query = `${event.data ?? ""}`
			const match =
				items.find((item) => item.title.toLowerCase().includes(query.toLowerCase())) ??
				items[0]
			if (match) data.dispatch(match.id)
			data.dispatch("palette.toggle")
		},
		"palette:run": (_self, data, event) => {
			data.dispatch(event.data)
			data.dispatch("palette.toggle")
		},
		"toolbar:run": (_self, data, event) => data.dispatch(event.data),
	}
}

export { createBehaviors, createEvents, createInit }

// EOF
