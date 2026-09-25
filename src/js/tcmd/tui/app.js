// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/app
// Root TUI component factory: two panes (breadcrumbs + FileList + summary
// each), a toolbar, an optional preview column and the command palette
// overlay. The app is the controller seam: component events (published
// bubbles) and key chords are translated into `session.dispatch(commandId,
// payload)` calls; the app never mutates model state directly.

import { ui } from "select.tui"
import { DEFAULT_KEYMAP, matchKeymap } from "../core/keymap.js"
import { registerComponents } from "./catalogue.js"
import { theme } from "./theme.js"

registerComponents()

// Function: readValue
// Unwraps cell-or-plain values from component data.
function readValue(value) {
	return value?.isReactive ? value.value : value
}

// Function: createAppComponent
// Builds the root component bound to a `session` (see tcmd/core/session).
//
// Example:
// ```javascript
// const App = createAppComponent(session)
// await render(App, { useMouse: true })
// ```
function createAppComponent(session) {
	const left = session.panes.left
	const right = session.panes.right
	return ui(`
		<box flexDirection="column" width="100%" height="100%" on:keypress="keys">
			<toolbar in:commands="commandRows" height="1"></toolbar>
			<box flexDirection="row" flexGrow="1">
				<box flexDirection="column" width="40%" border out:borderColor="leftBorderFg">
					<breadcrumbs in:segments="leftSegments" in:paneId="leftId" height="1"></breadcrumbs>
					<filelist in:entries="leftEntries" in:cursor="leftCursor" in:marked="leftMarked" in:paneId="leftId"></filelist>
					<summary in:entries="leftEntries" in:disk="leftDisk" height="1"></summary>
				</box>
				<filepreview in:preview="preview" in:show="showPreview" width="30%" when="showPreview"></filepreview>
				<box flexDirection="column" width="30%" border out:borderColor="rightBorderFg">
					<breadcrumbs in:segments="rightSegments" in:paneId="rightId" height="1"></breadcrumbs>
					<filelist in:entries="rightEntries" in:cursor="rightCursor" in:marked="rightMarked" in:paneId="rightId"></filelist>
					<summary in:entries="rightEntries" in:disk="rightDisk" height="1"></summary>
				</box>
			</box>
			<box height="1"><text out="status" out:fg="statusFg"></text></box>
			<commandpalette in:open="paletteOpen" in:query="paletteQuery" in:items="paletteItems" in:index="paletteIndex"></commandpalette>
		</box>
	`)
		.init(() => ({
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
		}))
		.does({
			// Global key handling: palette mode first, then the keymap.
			keys: (self, data, key) => {
				if (readValue(data.paletteOpen)) {
					if (key?.name === "escape") {
						data.dispatch("palette.toggle")
						return
					}
					if (key?.name === "return" || key?.name === "enter") {
						self.pub("palette:confirm", readValue(data.paletteQuery) ?? "")
						return
					}
					// Let the focused input handle typing.
					return
				}
				const id = matchKeymap(DEFAULT_KEYMAP, key)
				if (!id) return
				if (id === "app.quit") {
					// Destroying the renderer from within a keypress deadlocks the
					// native render loop; defer past the current frame.
					setTimeout(() => {
						self.quit()
						process.exit(0)
					}, 100)
					return
				}
				data.dispatch(id, { paneId: readValue(data.active) })
			},
			// Component events arrive through `pub` with (self, payload, orig).
			"crumbs:go": (self, payload) => self.data.dispatch("pane.setPath", payload),
			"list:select": (self, payload) => self.data.dispatch("list.cursor", payload),
			leftBorderFg: (_self, data) => (readValue(data.active) === "left" ? theme.accentFg : theme.borderFg),
			"palette:confirm": (self, payload) => {
				const data = self.data
				// The global key handler and the input's on:enter can both fire;
				// only the first one (while the palette is open) acts.
				if (!readValue(data.paletteOpen)) return
				const items = readValue(data.paletteItems) ?? []
				const query = `${payload ?? ""}`
				const match =
					items.find((item) => item.title.toLowerCase().includes(query.toLowerCase())) ?? items[0]
				if (match) data.dispatch(match.id)
				data.dispatch("palette.toggle")
			},
			"palette:run": (self, payload) => {
				self.data.dispatch(payload)
				self.data.dispatch("palette.toggle")
			},
			rightBorderFg: (_self, data) => (readValue(data.active) === "right" ? theme.accentFg : theme.borderFg),
			status: (_self, data) => {
				const error = readValue(data.leftError) ?? readValue(data.rightError)
				if (error) return `error: ${error}`
				return ""
			},
			statusFg: () => theme.errorFg,
			"toolbar:run": (self, payload) => self.data.dispatch(payload),
		})
}

export { createAppComponent }

// EOF
