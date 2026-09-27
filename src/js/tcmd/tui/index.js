// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui
// Terminal UI entry point: builds the session from the core, wires the app
// component and hands it to the select.tui/OpenTUI renderer. The host adapter
// releases the terminal around `$EDITOR`/shell commands and restores it when
// they exit.

import nodeOs from "node:os"
import { render } from "select.tui"
import { createNodeFs, createNodeOs, createPane, createSession, load } from "../core/index.js"
import { createAppComponent } from "./app.js"

// Function: main
// Runs the TUI. `paths` are optional initial directories [left, right].
async function main(paths = []) {
	const fs = createNodeFs()
	const left = createPane({ fs, path: paths[0] || fs.cwd() })
	const right = createPane({ fs, path: paths[1] || fs.home() })
	let instance = null
	const os = createNodeOs({
		suspend: () => instance?._ownedRenderer?.suspend?.(),
		resume: () => instance?._ownedRenderer?.resume?.(),
	})
	const session = createSession({ fs, os, left, right, host: nodeOs.hostname() })
	await load(session)
	const App = createAppComponent(session)
	instance = await render(App, { useMouse: true, exitOnCtrlC: false })
	return session
}

export { main }
