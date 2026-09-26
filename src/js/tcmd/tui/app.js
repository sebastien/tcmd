// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui/app
// Binds the shared App controller (`components/App.js`) to the TUI layout
// (`components/App.xml`) and to the select.tui `ui` runtime.

import { ui } from "select.tui"
import appXml from "../components/App.xml" with { type: "text" }
import { createBehaviors, createEvents, createInit } from "../components/App.js"
import { registerComponents } from "./catalogue.js"
import { theme } from "./theme.js"

registerComponents()

// Function: createAppComponent
// Builds the root component bound to a `session` (see tcmd/core/session).
//
// Example:
// ```javascript
// const App = createAppComponent(session)
// await render(App, { useMouse: true })
// ```
function createAppComponent(session) {
	const env = {
		accentFg: theme.accentFg,
		borderFg: theme.borderFg,
		errorFg: theme.errorFg,
		normalizeKey: (key) => key,
		quit: (self) => {
			// Destroying the renderer from within a keypress deadlocks the
			// native render loop; defer past the current frame.
			setTimeout(() => {
				self.quit()
				process.exit(0)
			}, 100)
		},
	}
	return ui
		.component("App")
		.init(createInit(session))
		.does(createBehaviors(env))
		.sub(createEvents())
		.using(appXml)
}

export { createAppComponent }
