// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/App
// Root component: a header, two panes (breadcrumbs + FileList + summary each),
// an optional preview column, the command bar and the command palette overlay.
// App is the controller seam: component events (published bubbles) and key
// chords are translated into `session.dispatch(commandId, payload)` calls; it
// never mutates model state directly.
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
		appHost: session.host,
		appPath: session.activePath,
		commandBarItems: session.commandBarItems,
		confirm: session.confirm,
		dispatch: session.dispatch,
		filtering: session.filtering,
		leftActiveIndex: left.activeIndex,
		leftCursor: left.cursor,
		leftDisk: left.disk,
		leftEntries: left.entries,
		leftError: left.error,
		leftFilter: left.filter,
		leftId: "left",
		leftMarked: left.marked,
		leftSegments: left.segments,
		leftTabs: left.tabs,
		notice: session.notice,
		paletteIndex: session.paletteIndex,
		paletteItems: session.paletteItems,
		paletteMode: session.paletteMode,
		paletteOpen: session.paletteOpen,
		paletteQuery: session.paletteQuery,
		preview: session.preview,
		rightActiveIndex: right.activeIndex,
		rightCursor: right.cursor,
		rightDisk: right.disk,
		rightEntries: right.entries,
		rightError: right.error,
		rightFilter: right.filter,
		rightId: "right",
		rightMarked: right.marked,
		rightSegments: right.segments,
		rightTabs: right.tabs,
		showPreview: session.showPreview,
	})
}

// Function: createBehaviors
// Builds the App data/key behavior map for the given renderer environment.
// Published events are registered separately via `createEvents()` (`.sub`).
function createBehaviors(env) {
	return {
		// Global key handling: confirm dialogs first, palette mode, then the
		// keymap.
		keys: (self, data, event) => {
			const key = env.normalizeKey ? env.normalizeKey(event) : event
			if (unwrap(data.confirm)) {
				const name = key?.name
				if (name === "y" || name === "return" || name === "enter") data.dispatch("confirm.yes")
				else if (name === "n" || name === "escape") data.dispatch("confirm.no")
				return
			}
			if (unwrap(data.paletteOpen)) {
				if (key?.name === "escape") {
					data.dispatch("palette.toggle")
					return
				}
				if (key?.name === "up") {
					data.dispatch("palette.up")
					return
				}
				if (key?.name === "down") {
					data.dispatch("palette.down")
					return
				}
				if (key?.name === "tab") {
					// Shift-Tab walks the palette list backwards.
					data.dispatch(key.shift ? "palette.up" : "palette.complete")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					self.pub("palette:confirm", `${unwrap(data.paletteQuery) ?? ""}`)
					return
				}
				// Let the focused input handle typing.
				return
			}
			const active = unwrap(data.active)
			if (unwrap(data.filtering) === active) {
				// The filter input owns the keyboard: Esc clears, Enter keeps
				// the filter and returns to the list, arrows move the cursor.
				if (key?.name === "escape") {
					data.dispatch("filter.clear")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					data.dispatch("filter.accept")
					return
				}
				if (key?.name === "tab") {
					// Tab keeps the filter and returns to the list; Shift-Tab
					// switches back to the other pane.
					data.dispatch(key.shift ? "pane.toggle" : "filter.accept")
					return
				}
				if (key?.name === "up") {
					data.dispatch("nav.up")
					return
				}
				if (key?.name === "down") {
					data.dispatch("nav.down")
					return
				}
				// Let the focused filter input handle typing.
				return
			}
			// Esc clears an accepted filter on the active pane.
			if (key?.name === "escape") {
				const filter = active === "left" ? unwrap(data.leftFilter) : unwrap(data.rightFilter)
				if (filter) data.dispatch("filter.clear")
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
	}
}

// Function: createEvents
// App event subscriptions, registered with `.sub(...)`. Handlers receive
// `(self, data, event)` with the published payload in `event.data`.
function createEvents() {
	return {
		"commandbar:run": (_self, data, event) => {
			if (event.data) data.dispatch(event.data)
		},
		"crumbs:go": (_self, data, event) => data.dispatch("pane.setPath", event.data),
		"list:select": (_self, data, event) => data.dispatch("list.cursor", event.data),
		"pane:activate": (_self, data, event) => data.dispatch("pane.activate", { paneId: event.data }),
		"tabs:new": (_self, data, event) => data.dispatch("tab.new", event.data),
		"tabs:select": (_self, data, event) => data.dispatch("tab.select", event.data),
		"palette:confirm": (_self, data, event) => {
			// The global key handler and the input's on:enter can both fire;
			// only the first one (while the palette is open) acts.
			if (!unwrap(data.paletteOpen)) return
			if (unwrap(data.paletteMode) === "script") {
				// Submit the typed line: run it, or complete the highlighted row
				// when the input is empty.
				data.dispatch("palette.submit")
				return
			}
			const items = unwrap(data.paletteItems) ?? []
			const index = Math.max(0, Math.min(unwrap(data.paletteIndex) ?? 0, items.length - 1))
			const match = items[index] ?? items[0]
			if (match?.id) data.dispatch(match.id)
			data.dispatch("palette.toggle")
		},
		"palette:run": (_self, data, event) => {
			if (!event.data) return
			if (unwrap(data.paletteMode) === "script") {
				// Clicking a script row completes it; running stays on Enter.
				const item = (unwrap(data.paletteItems) ?? []).find((row) => row.id === event.data)
				if (item?.completion) data.dispatch("palette.setQuery", { query: item.completion })
				return
			}
			data.dispatch(event.data)
			data.dispatch("palette.toggle")
		},
	}
}

export { createBehaviors, createEvents, createInit }

// EOF
