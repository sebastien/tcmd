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

import { derived, unwrap } from "select/state/cells"
import { DEFAULT_KEYMAP, matchKeymap } from "../core/keymap.js"
import { PANEL_FOCUS } from "../core/panel.js"

// Function: createInit
// State initializer binding the root component to a `session`.
function createInit(session) {
	const left = session.panes.left
	const right = session.panes.right
	// Pane-focus flags so the listing can render the cursor differently in the
	// inactive pane. Shared by both engines.
	const leftActive = derived([session.active], ([active]) => active === "left")
	const rightActive = derived([session.active], ([active]) => active === "right")
	return () => ({
		active: session.active,
		// The preview target entry, so the inspector can show a directory card
		// even when there is no text/card preview.
		appEntry: session.previewEntry,
		appHost: session.host,
		appPath: session.activePath,
		bookmarkIndex: session.bookmarkIndex,
		bookmarkItems: session.bookmarkItems,
		bookmarkMode: session.bookmarkMode,
		bookmarkOpen: session.bookmarkOpen,
		bookmarkQuery: session.bookmarkQuery,
		bookmarkTarget: session.bookmarkTarget,
		commandBarItems: session.commandBarItems,
		confirm: session.confirm,
		dispatch: session.dispatch,
		filtering: session.filtering,
		leftActive,
		leftCursor: left.cursor,
		leftDisk: left.disk,
		leftEntries: left.entries,
		leftEntry: session.leftCursorEntry,
		leftError: left.error,
		leftFilter: left.filter,
		leftId: "left",
		leftLoading: left.loading,
		leftMarked: left.marked,
		leftSegments: left.segments,
		notice: session.notice,
		paletteIndex: session.paletteIndex,
		paletteItems: session.paletteItems,
		paletteMode: session.paletteMode,
		paletteOpen: session.paletteOpen,
		paletteQuery: session.paletteQuery,
		panelCommand: session.panelCommand,
		panelDraft: session.panelDraft,
		panelCursorRow: session.panelCursorRow,
		panelFiltered: session.panelFiltered,
		panelFocus: session.panelFocus,
		panelOpIndex: session.panelOpIndex,
		panelItems: session.panelItems,
		panelOpen: session.panelOpen,
		panelOperation: session.panelOperation,
		panelQuery: session.panelQuery,
		panelRowIndex: session.panelRowIndex,
		panelRows: session.panelRows,
		panelRunnable: session.panelRunnable,
		panelTextual: session.panelTextual,
		panelValue: session.panelValue,
		preview: session.preview,
		rightActive,
		rightCursor: right.cursor,
		rightDisk: right.disk,
		rightEntries: right.entries,
		rightEntry: session.rightCursorEntry,
		rightError: right.error,
		rightFilter: right.filter,
		rightId: "right",
		rightLoading: right.loading,
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
			if (unwrap(data.panelOpen)) {
				const focus = unwrap(data.panelFocus)
				// Escape closes; Tab cycles the focus ring (command ⇄ args);
				// arrows move within the focused column; Enter runs the command.
				if (key?.name === "escape") {
					data.dispatch("panel.cancel")
					return
				}
				if (key?.name === "tab") {
					data.dispatch("panel.tab", { delta: key.shift ? -1 : 1 })
					return
				}
				if (key?.name === "up") {
					data.dispatch(focus === PANEL_FOCUS.ARGS ? "panel.prevArg" : "panel.up")
					return
				}
				if (key?.name === "down") {
					data.dispatch(focus === PANEL_FOCUS.ARGS ? "panel.nextArg" : "panel.down")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					// A focused textual-argument field owns Enter (its `on:enter`
					// publishes `panel:confirm`), so the command is not run twice.
					if (focus === PANEL_FOCUS.ARGS && unwrap(data.panelTextual)) return
					// Enter runs the highlighted command with the current draft.
					data.dispatch("panel.run")
					return
				}
				// Space toggles a selection item in the argument column.
				if (key?.name === "space" && focus === PANEL_FOCUS.ARGS && !unwrap(data.panelTextual)) {
					data.dispatch("panel.toggleItem")
					return
				}
				if (key?.name === "backspace" && focus === PANEL_FOCUS.ARGS) {
					// Editing the command filter from the argument column.
					data.dispatch("panel.type", { backspace: true })
					return
				}
				// While the command column is focused, or a textual argument
				// owns the cursor, the focused input handles typing.
				if (focus !== PANEL_FOCUS.ARGS || unwrap(data.panelTextual)) return
				// Typing on a non-textual argument jumps back to the command
				// filter and appends the character.
				if (key?.name && key.name.length === 1 && !key.ctrl && !key.meta) {
					data.dispatch("panel.type", { char: key.name })
					return
				}
				return
			}
			if (unwrap(data.bookmarkOpen)) {
				const mode = unwrap(data.bookmarkMode)
				if (key?.name === "escape") {
					data.dispatch("bookmark.cancel")
					return
				}
				if (mode === "name") {
					// The input owns typing; Enter saves.
					if (key?.name === "return" || key?.name === "enter") {
						self.pub("bookmark:confirm")
						return
					}
					return
				}
				// List mode: arrows move, Enter jumps.
				if (key?.name === "up") {
					data.dispatch("bookmark.up")
					return
				}
				if (key?.name === "down") {
					data.dispatch("bookmark.down")
					return
				}
				if (key?.name === "return" || key?.name === "enter") {
					self.pub("bookmark:confirm")
					return
				}
				// Let the focused input handle typing the fuzzy query.
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
			// Esc clears an accepted filter on the active pane; without a
			// filter (or on Shift-Esc) the keymap decides — Esc steps back
			// through the pane's directory history.
			if (key?.name === "escape" && !key.shift) {
				const filter = active === "left" ? unwrap(data.leftFilter) : unwrap(data.rightFilter)
				if (filter) {
					data.dispatch("filter.clear")
					return
				}
			}
			const id = matchKeymap(DEFAULT_KEYMAP, key)
			if (!id) return
			if (id === "app.quit") {
				env.quit(self)
				return
			}
			// The command panel is a TUI-only view; the web renderer omits the
			// capability so `m` never opens an invisible modal there.
			if (id === "panel.toggle" && !env.panel) return
			data.dispatch(id, { paneId: unwrap(data.active) })
		},
	}
}

// Function: createEvents
// App event subscriptions, registered with `.sub(...)`. Handlers receive
// `(self, data, event)` with the published payload in `event.data`. The
// environment carries the renderer's `quit` hook, so the command bar's Quit
// entry takes the same path as the `q` key.
function createEvents(env = {}) {
	return {
		"commandbar:run": (_self, data, event) => {
			if (event.data === "app.quit") {
				env.quit?.(_self)
				return
			}
			if (event.data) data.dispatch(event.data)
		},
		"panel:select": (_self, data, event) => {
			// Clicking an operation row moves the cursor to it; clicking an
			// argument/item row focuses the argument column (toggling an item).
			const items = unwrap(data.panelItems) ?? []
			const index = items.findIndex((row) => row.id === event.data)
			if (index >= 0) {
				data.dispatch("panel.setOp", { index })
				return
			}
			const rows = unwrap(data.panelRows) ?? []
			const rowIndex = rows.findIndex((row) => row.key === event.data)
			if (rowIndex < 0) return
			data.dispatch("panel.focusArg")
			data.dispatch("panel.setRow", { index: rowIndex })
			const row = rows[rowIndex]
			if (row?.type === "item") data.dispatch("panel.toggleItem")
		},
		"panel:confirm": (_self, data) => {
			if (!unwrap(data.panelOpen)) return
			data.dispatch("panel.run")
		},
		"crumbs:go": (_self, data, event) => {
			// The "…" truncation marker carries no path.
			if (!event.data?.path) return
			data.dispatch("pane.setPath", event.data)
		},
		"list:select": (_self, data, event) => data.dispatch("list.cursor", event.data),
		"pane:activate": (_self, data, event) => data.dispatch("pane.activate", { paneId: event.data }),
		"bookmark:select": (_self, data, event) => {
			// Clicking a bookmark row selects and jumps to it.
			if (!unwrap(data.bookmarkOpen)) return
			const items = unwrap(data.bookmarkItems) ?? []
			const index = items.findIndex((row) => row.name === event.data)
			if (index < 0) return
			data.dispatch("bookmark.setIndex", { index })
			data.dispatch("bookmark.select")
		},
		"bookmark:confirm": (_self, data) => {
			if (!unwrap(data.bookmarkOpen)) return
			if (unwrap(data.bookmarkMode) === "name") data.dispatch("bookmark.save")
			else data.dispatch("bookmark.select")
		},
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
