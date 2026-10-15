// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/tui
// Terminal UI entry point: builds the session from the core, wires the app
// component and hands it to the select.tui/OpenTUI renderer. The host adapter
// releases the terminal around `$EDITOR`/shell commands and restores it when
// they exit. This layer also wires the JSON-file bookmark store (the core
// stays free of Node imports).

import nodeOs from "node:os"
import nodePath from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { cell } from "select/state/cells"
import { render } from "select.tui"
import { createBookmarks, createFileBookmarkStore } from "../core/bookmarks.js"
import { createNodeFs, createNodeOs, createPane, createSession, load } from "../core/index.js"
import { createAppComponent, attachModifierHint } from "./app.js"

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

// Function: bookmarkFile
// The JSON file the TUI persists bookmarks to:
// `$TCMD_BOOKMARKS_FILE` or `$XDG_CONFIG_HOME/tcmd/bookmarks.json` (default
// `~/.config/tcmd/bookmarks.json`).
function bookmarkFile() {
	if (process.env.TCMD_BOOKMARKS_FILE) return process.env.TCMD_BOOKMARKS_FILE
	const configHome = process.env.XDG_CONFIG_HOME || nodePath.join(nodeOs.homedir(), ".config")
	return nodePath.join(configHome, "tcmd", "bookmarks.json")
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
	const bookmarks = createBookmarks({
		store: createFileBookmarkStore({
			file: bookmarkFile(),
			readFile,
			writeFile,
			mkdir,
		}),
	})
	const session = createSession({ fs, os, left, right, host: nodeOs.hostname(), bookmarks })
	await load(session)
	const size = cell({ width: 0, height: 0 })
	const help = cell(false)
	const App = createAppComponent(session, { size, help })
	// The kitty keyboard protocol reports modifier key presses and releases
	// (and every key as an escape code), which is what lets the command bar
	// reveal Shift/Ctrl chords while one is held. Terminals that do not speak
	// it simply never send the events, and the bar stays on its default hints.
	instance = await render(App, {
		useMouse: true,
		exitOnCtrlC: false,
		useKittyKeyboard: { events: true, allKeysAsEscapes: true },
	})
	const renderer = instance?.ctx ?? instance?.renderer
	if (renderer?.keyInput) attachModifierHint(session, renderer.keyInput)
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

export { main, readSize }

// EOF
