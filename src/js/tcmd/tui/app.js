// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/app
// Binds the shared App controller (`components/App.js`) to the TUI layout
// (`components/App.xml`) and to the select.tui `ui` runtime.
//
// The TUI layers two presentation-only cells on top of the shared controller:
// `size` (viewport dimensions from the renderer's resize events) and `help`
// (the `?` overlay). A third, `viewer`, tracks the fullscreen inspector used
// below the inline-inspector breakpoint. None of them exist in the web view.

import { cell, derived, unwrap } from "select/state/cells"
import { ui } from "select.tui"
import appXml from "../components/App.xml" with { type: "text" }
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerComponents } from "./catalogue.js"
import { createFrameBehaviors, isNarrow, BAR_COMPACT_WIDTH } from "./frame.js"
import { tuiTheme } from "./theme.js"

// Function: createAppComponent
// Builds the root component bound to a `session`.
//
// Options:
// - `size`: a `{ width, height }` cell fed by renderer resize events.
// - `help`: the `?` overlay visibility cell.
//
// Example:
// ```javascript
// const App = createAppComponent(session, { size })
// await render(App, { useMouse: true })
// ```
function createAppComponent(session, options = {}) {
	registerComponents()
	const size = options.size ?? cell({ width: 0, height: 0 })
	const help = options.help ?? cell(false)
	const viewer = options.viewer ?? cell(false)

	// The command bar drops to its essential hints on narrower viewports.
	const barCompact = derived([size], ([value]) => Boolean(value?.width > 0 && value.width < BAR_COMPACT_WIDTH))

	const quit = options.quit ?? ((self) => {
		// Destroying the renderer from within a keypress deadlocks the native
		// render loop; defer past the current frame.
		setTimeout(() => {
			self.quit()
			process.exit(0)
		}, 100)
	})

	const baseKeys = appBehaviors({ quit }).keys
	const frame = createFrameBehaviors({ theme: tuiTheme })

	return ui
		.component("App")
		.init(() => ({
			...appInit(session)(),
			uiSize: size,
			helpOpen: help,
			viewerOpen: viewer,
			barCompact,
		}))
		.does({
			...frame,
			keys: (self, data, event) => {
				const key = event
				const name = key?.name
				const isQuestion = name === "?" || (name === "/" && key?.shift)
				const busy =
					unwrap(data.paletteOpen) ||
					unwrap(data.confirm) ||
					unwrap(data.filtering) ||
					unwrap(data.bookmarkOpen)

				// Help overlay owns the keyboard while open.
				if (unwrap(data.helpOpen)) {
					if (name === "escape" || name === "q" || isQuestion) help.set(false)
					return
				}
				if (!busy && isQuestion) {
					help.set(true)
					return
				}
				// The fullscreen viewer: Esc closes, O/E act on the file.
				if (viewer.value && isNarrow(data, self)) {
					if (name === "escape") {
						viewer.set(false)
						return
					}
					if (name === "o" && key.shift) return data.dispatch("file.open", { paneId: unwrap(data.active) })
					if (name === "e" && key.shift) return data.dispatch("file.edit", { paneId: unwrap(data.active) })
					return
				}
				// Below the inline breakpoint `v` toggles the viewer overlay
				// instead of the side panel.
				if (!busy && name === "v" && isNarrow(data, self)) {
					viewer.set(!viewer.value)
					return
				}
				return baseKeys(self, data, event)
			},
			// TUI-only presentation of the shared App state.
			leftBorderFg: (_self, data) =>
				unwrap(data.active) === "left" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			rightBorderFg: (_self, data) =>
				unwrap(data.active) === "right" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			// The header rule carries the same focus tint as the pane border.
			leftHeadRuleFg: (_self, data) =>
				unwrap(data.active) === "left" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
			rightHeadRuleFg: (_self, data) =>
				unwrap(data.active) === "right" ? tuiTheme.borderSecondaryActiveFg : tuiTheme.borderSecondaryFg,
		})
		.sub(appEvents())
		.using(appXml)
}

export { createAppComponent }

// EOF
