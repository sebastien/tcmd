// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/main
// Browser entry point for the web view. Picks a filesystem backend (OPFS when
// available, the HTTP API from `web/server.js` otherwise), builds the shared
// session over it plus the null host adapter, and mounts the select.js UI into
// `#app`. `window.tcmd` exposes the session for console poking.
//
// Backend choice: `?fs=opfs` or `?fs=http` forces one; by default OPFS is
// preferred and HTTP is the fallback, so browsers without OPFS (or insecure
// origins) still work when the page is served by `bun run web:serve`.
//
// select.js renders on animation frames and does no focus management, so this
// module adds the two browser bits the shared components cannot know about:
// default-key trapping and focus tracking.
//
// Built by `bun run web:build` (see package.json) into `public/main.js`.

import { effect } from "select/state/cells"
import { createNullOs } from "../core/os.js"
import { createPane } from "../core/pane.js"
import { createSession, load } from "../core/session.js"
import { apiToken, createHttpFs } from "./http.js"
import { main as mount } from "./index.js"
import { createOpfsFs } from "./opfs.js"
import { seedOpfs } from "./seed.js"

// Constant: APP_KEYS
// Keys with browser defaults that would fight the app keymap: focus traversal
// (Tab), caret/scroll arrows, page scroll (Space) and history Backspace.
const APP_KEYS = new Set([
	" ",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"Backspace",
	"Enter",
	"Tab",
])

// Function: trapKeys
// Keeps browser defaults out of the way while the app owns the keyboard. Space
// and Backspace stay untouched in text inputs so the palette query can be
// typed; the app routes every other listed key itself.
function trapKeys(root) {
	root?.addEventListener("keydown", (event) => {
		const inInput = event.target instanceof HTMLInputElement
		if (inInput && (event.key === " " || event.key === "Backspace")) return
		if (APP_KEYS.has(event.key)) event.preventDefault()
	})
}

// Function: trackFocus
// The key handler lives on the app root, so focus must stay inside it. The
// palette input is focused while the palette is open (select.js does not), and
// the active pane's filter input while that pane is filtering; focus returns to
// the app root otherwise. Focus that leaves the app — a removed input, a click
// on the page background — is pulled back.
function trackFocus(session, root) {
	if (!root) return
	const focusInput = () => {
		if (session.paletteOpen.value) return document.querySelector("#app .palette-input")
		if (session.filtering.value) {
			return document.querySelector(`#app .pane-${session.filtering.value} .filter-input`)
		}
		return null
	}
	const applyFocus = () => {
		// select.js swaps the palette DOM on animation frames: wait for it.
		requestAnimationFrame(() => {
			const input = focusInput()
			if (input) input.focus()
			else if (!root.contains(document.activeElement)) root.focus()
		})
	}
	effect([session.paletteOpen, session.filtering], applyFocus)
	document.addEventListener("focusout", (event) => {
		if (!session.paletteOpen.value && !session.filtering.value && event.relatedTarget && root.contains(event.relatedTarget)) {
			return
		}
		applyFocus()
	})
}

// Function: createOpfsBackend
// OPFS adapter, probed and seeded. `readDir("/")` resolves the OPFS root, so
// it throws when the browser has no OPFS (a plain `stat("/")` would not).
async function createOpfsBackend() {
	const fs = createOpfsFs()
	await fs.readDir("/") // throws when OPFS is unavailable
	await seedOpfs(fs)
	return fs
}

// Function: createBackend
// Resolves `{ mode, fs }` from the `?fs=` override, or by trying OPFS first
// and falling back to the HTTP API.
async function createBackend() {
	const requested = new URLSearchParams(globalThis.location?.search ?? "").get("fs")
	if (requested === "opfs") return { mode: "opfs", fs: await createOpfsBackend() }
	if (requested === "http") return { mode: "http", fs: await createHttpFs({ token: apiToken() }) }
	try {
		return { mode: "opfs", fs: await createOpfsBackend() }
	} catch (error) {
		console.info("tcmd web: OPFS unavailable, falling back to the HTTP filesystem API", error)
		return { mode: "http", fs: await createHttpFs({ token: apiToken() }) }
	}
}

// Function: start
// Boots the session and mounts the UI.
async function start() {
	const host = document.querySelector("#app")
	try {
		const { mode, fs } = await createBackend()
		const left = createPane({ fs, path: fs.cwd() })
		const right = createPane({
			fs,
			path: mode === "opfs" ? "/" : fs.home() === fs.cwd() ? fs.root() : fs.home(),
		})
		const session = createSession({
			fs,
			os: createNullOs(),
			left,
			right,
			host: globalThis.location?.hostname ?? "",
		})
		await load(session)
		const instance = mount(session, "#app")
		const root = document.querySelector("#app .app")
		root?.focus()
		trapKeys(root)
		trackFocus(session, root)
		document.title = `TinyCMD web (${mode})`
		globalThis.tcmd = { fs, mode, session, instance }
	} catch (error) {
		const hint =
			"OPFS needs a secure context (localhost or https); the HTTP filesystem API needs the page " +
			"served by `bun run web:serve`."
		host.textContent = `TinyCommand web could not start: ${error?.message ?? error}. ${hint}`
		throw error
	}
}

void start()

// EOF
