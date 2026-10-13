// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/App
// Root component: a header, two panes (breadcrumbs + FileList + summary each),
// an optional preview column, the command bar and the command panel overlay.
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
	const parent = session.panes.parent ?? {}
	const preview = session.panes.preview ?? {}
	// Pane-focus flags so the listing can render the cursor differently in the
	// inactive pane. Shared by both engines.
	const leftActive = derived([session.active], ([active]) => active === "left")
	const rightActive = derived([session.active], ([active]) => active === "right")
	const parentActive = derived([session.active], ([active]) => active === "parent")
	const previewActive = derived([session.active], ([active]) => active === "preview")
	return () => ({
		active: session.active,
		// The preview target entry, so the inspector can show a directory
		// column even when there is no text/card preview.
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
		currentId: session.currentId,
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
		panelCommand: session.panelCommand,
		panelDraft: session.panelDraft,
		panelCursorRow: session.panelCursorRow,
		panelEntry: session.panelEntry,
		panelFiltered: session.panelFiltered,
		panelFocus: session.panelFocus,
		panelOpIndex: session.panelOpIndex,
		panelItems: session.panelItems,
		panelOpen: session.panelOpen,
		panelQuery: session.panelQuery,
		panelRowIndex: session.panelRowIndex,
		panelRows: session.panelRows,
		panelRunnable: session.panelRunnable,
		panelTextual: session.panelTextual,
		panelValue: session.panelValue,
		// The explorer's first column: the parent of the current directory.
		parentActive,
		parentCursor: parent.cursor,
		parentDisk: parent.disk,
		parentEntries: parent.entries,
		parentEntry: session.parentCursorEntry,
		parentError: parent.error,
		parentFilter: parent.filter,
		parentId: "parent",
		parentLoading: parent.loading,
		parentMarked: parent.marked,
		parentSegments: parent.segments,
		preview: session.preview,
		// The third column: the directory the inspector previews, so it reads
		// as a pane. Over a file the inspector stays a card and these idle.
		previewActive,
		previewCursor: preview.cursor,
		previewEntries: preview.entries,
		previewId: "preview",
		previewLoading: preview.loading,
		previewMarked: preview.marked,
		previewSegments: preview.segments,
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
		viewMode: session.viewMode,
	})
}

// Function: inputOwnsEnter
// True when one of the panel's inputs has the keyboard, and so its `on:enter`
// publishes `panel:confirm`: the filter field while the entry column is
// focused, the value field while a textual argument owns the cursor. A plain
// argument row has no input pressed, so the key handler runs the command.
function inputOwnsEnter(data, focus) {
	return focus === PANEL_FOCUS.OPS || Boolean(unwrap(data.panelTextual))
}

// Function: createBehaviors
// Builds the App data/key behavior map for the given renderer environment.
// Published events are registered separately via `createEvents()` (`.sub`).
function createBehaviors(env) {
	return {
		// Global key handling: confirm dialogs first, the command panel, then
		// the keymap.
		keys: (self, data, event) => {
			const key = env.normalizeKey ? env.normalizeKey(event) : event
			if (unwrap(data.confirm)) {
				const name = key?.name
				if (name === "y" || name === "return" || name === "enter") data.dispatch("confirm.yes")
				else if (name === "n" || name === "escape") data.dispatch("confirm.no")
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
					// The focused input owns Enter (its `on:enter` publishes
					// `panel:confirm`): the query field while the entry column
					// is focused, the value field while a textual argument owns
					// the cursor. Only a plain argument row has no input to
					// press, so only then does the key run the command.
					if (env.inputOwnsEnter !== false && inputOwnsEnter(data, focus)) return
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
				const filters = {
					left: data.leftFilter,
					parent: data.parentFilter,
					right: data.rightFilter,
				}
				const filter = unwrap(filters[active])
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
			// Published by a focused panel input's `on:enter`; the key handler
			// leaves Enter to it (see `inputOwnsEnter`).
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
	}
}

export { createBehaviors, createEvents, createInit }

// EOF
