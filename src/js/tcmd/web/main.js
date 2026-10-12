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
// DOM effects (focus, key trapping, resize, scroll) live in `web/effects.js`
// and are wired by the App binding in `web/app.js`; bookmarks persist through
// `web/bookmarks.js`, namespaced by backend and API root.
//
// Built by `bun run web:build` (see package.json) into `public/main.js`.

import { createBookmarks } from "../core/bookmarks.js"
import { createNullOs } from "../core/os.js"
import { createPane } from "../core/pane.js"
import { createSession, load } from "../core/session.js"
import { apiToken, createHttpFs } from "./http.js"
import { main as mount } from "./index.js"
import { createOpfsFs } from "./opfs.js"
import { seedOpfs } from "./seed.js"
import { createWebBookmarkStore } from "./bookmarks.js"

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
			bookmarks: createBookmarks({ store: createWebBookmarkStore({ mode, root: mode === "opfs" ? "/" : fs.root() }) }),
		})
		await load(session)
		const instance = mount(session, "#app")
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
