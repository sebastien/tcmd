// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui
// Terminal UI entry point: builds the session from the core, wires the app
// component and hands it to the select.tui/OpenTUI renderer.

import { render } from "select.tui"
import { createPane, createSession, createNodeFs, load } from "../core/index.js"
import { createAppComponent } from "./app.js"
import { registerComponents } from "./catalogue.js"

// Function: main
// Runs the TUI. `paths` are optional initial directories [left, right].
async function main(paths = []) {
	registerComponents()
	const fs = createNodeFs()
	const left = createPane({ fs, path: paths[0] || fs.cwd() })
	const right = createPane({ fs, path: paths[1] || fs.home() })
	const session = createSession({ fs, left, right })
	await load(session)
	const App = createAppComponent(session)
	await render(App, { useMouse: true, exitOnCtrlC: false })
	return session
}

export { main }

// EOF
