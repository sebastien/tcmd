// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/app
// Binds the shared App controller (`components/App.js`) to the TUI layout
// (`components/App.xml`) and to the select.tui `ui` runtime.

import { ui } from "select.tui"
import { unwrap } from "select/state/cells"
import appXml from "../components/App.xml" with { type: "text" }
import { appBehaviors, appEvents, appInit } from "../components/index.js"
import { registerComponents } from "./catalogue.js"
import { tuiTheme } from "./theme.js"

// Function: createAppComponent
// Builds the root component bound to a `session` (see tcmd/core/session).
//
// Example:
// ```javascript
// const App = createAppComponent(session)
// await render(App, { useMouse: true })
// ```
function createAppComponent(session) {
	registerComponents()
	return ui
		.component("App")
		.init(appInit(session))
		.does({
			...appBehaviors({
				quit: (self) => {
					// Destroying the renderer from within a keypress deadlocks the
					// native render loop; defer past the current frame.
					setTimeout(() => {
						self.quit()
						process.exit(0)
					}, 100)
				},
			}),
			// TUI-only presentation of the shared App state.
			leftBorderFg: (_self, data) =>
				unwrap(data.active) === "left" ? tuiTheme.accentFg : tuiTheme.borderFg,
			rightBorderFg: (_self, data) =>
				unwrap(data.active) === "right" ? tuiTheme.accentFg : tuiTheme.borderFg,
		})
		.sub(appEvents())
		.using(appXml)
}

export { createAppComponent }

// EOF
