// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui
// Terminal UI entry point: builds the session from the core, wires the app
// component and hands it to the select.tui/OpenTUI renderer. The host adapter
// releases the terminal around `$EDITOR`/shell commands and restores it when
// they exit.
//
// The TUI owns two presentation-only cells the core knows nothing about:
// `size` (viewport dimensions used for breakpoints and truncation) and `help`
// (the `?` overlay). Neither is part of the session model.

import nodeOs from "node:os"
import { cell } from "select/state/cells"
import { render } from "select.tui"
import { commandRow, getPaletteCommands } from "../core/commands.js"
import { createNodeFs, createNodeOs, createPane, createSession, load } from "../core/index.js"
import { createAppComponent } from "./app.js"

// The TUI palette lists meaningful actions; raw cursor movement is already on
// the arrow keys and is noise in the list. Hiding it here (rather than in core)
// keeps the web palette and the shared registry unchanged.
const PALETTE_NOISE = /^nav\./

// Function: tuiPaletteCommands
// The command rows the TUI palette offers.
function tuiPaletteCommands() {
	return getPaletteCommands()
		.filter((command) => !PALETTE_NOISE.test(command.id))
		.map(commandRow)
}

// Function: readSize
// Normalizes a renderer resize payload. OpenTUI's live renderer emits
// `(width, height)` as two arguments; the test renderer emits a bare width;
// some wrappers emit a `{ width, height }` / `{ columns, rows }` object.
function readSize(payload, height) {
	if (typeof payload === "number") return { width: payload, height }
	if (payload && typeof payload === "object") {
		return {
			width: payload.width ?? payload.columns,
			height: payload.height ?? payload.rows,
		}
	}
	return height === undefined ? {} : { height }
}

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
	session.paletteCommands.set(tuiPaletteCommands())
	await load(session)
	const size = cell({ width: 0, height: 0 })
	const help = cell(false)
	const App = createAppComponent(session, { size, help })
	instance = await render(App, { useMouse: true, exitOnCtrlC: false })
	const renderer = instance?.ctx ?? instance?.renderer
	const current = renderer?.width || renderer?.height
		? { width: renderer.width ?? 0, height: renderer.height ?? 0 }
		: { width: 0, height: 0 }
	size.set(current)
	renderer?.on?.("resize", (payload, height) => {
		const next = readSize(payload, height)
		size.set({
			width: next.width ?? size.value.width,
			height: next.height ?? size.value.height,
		})
	})
	return session
}

export { main, readSize, tuiPaletteCommands }

// EOF
