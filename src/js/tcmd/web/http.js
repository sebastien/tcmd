// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/http
// Filesystem adapter that talks to the JSON API exposed by `web/server.js`
// (`/api/*`) over `fetch`. Same interface as `web/opfs.js`, so the web entry
// can pick either backend. `createHttpFs` is async: it reads `/api/info` once
// to bake in the root/home/cwd paths the adapter interface reports
// synchronously.
//
// The token comes from the `<meta name="tcmd-token">` tag the server injects
// into `index.html`; when the page is not served by `bun run web:serve`, the
// API is unreachable and the factory fails with a hint.

// Function: apiToken
// Token injected into the host page, or null when absent/placeholder.
function apiToken(doc = globalThis.document) {
	const value = doc?.querySelector?.('meta[name="tcmd-token"]')?.getAttribute("content")
	return value && !value.startsWith("__") ? value : null
}

// Function: createHttpFs
// Builds the adapter. `base` is the API mount point (absolute URLs work too,
// which tests use); `fetch` is injectable.
async function createHttpFs({ base = "/api", token, fetch: doFetch = globalThis.fetch } = {}) {
	const apiBase = new URL(`${base.replace(/\/$/, "")}/`, globalThis.location?.href ?? "http://localhost/")

	// Function: request
	// One API call: query parameters for reads, a JSON body for mutations.
	async function request(method, route, { params, body } = {}) {
		const url = new URL(route, apiBase)
		for (const [key, value] of Object.entries(params ?? {})) {
			if (value !== undefined && value !== null) url.searchParams.set(key, `${value}`)
		}
		const init = { method, headers: {} }
		if (token) init.headers["x-tcmd-token"] = token
		if (body !== undefined) {
			init.headers["content-type"] = "application/json"
			init.body = JSON.stringify(body)
		}
		let response
		try {
			response = await doFetch(url, init)
		} catch (error) {
			throw new Error(
				`filesystem API unreachable at ${apiBase.origin} (serve the page with \`bun run web:serve\`)`,
			)
		}
		if (!response.ok) {
			const payload = await response.json().catch(() => null)
			throw new Error(payload?.error ?? `filesystem API error ${response.status}`)
		}
		return response.json()
	}

	const info = await request("GET", "info")
	return {
		readDir: (path) => request("GET", "readDir", { params: { path } }),
		stat: (path) => request("GET", "stat", { params: { path } }),
		isDir: async (path) => Boolean((await request("GET", "stat", { params: { path } }))?.isDir),
		readTextHead: (path, maxBytes) => request("GET", "readTextHead", { params: { path, maxBytes } }),
		du: (path) => request("GET", "du", { params: { path } }),
		disk: (path) => request("GET", "disk", { params: { path } }),
		copy: (from, to) => request("POST", "copy", { body: { from, to } }),
		move: (from, to) => request("POST", "move", { body: { from, to } }),
		mkdir: (path) => request("POST", "mkdir", { body: { path } }),
		trash: (paths) => request("POST", "trash", { body: { paths } }),
		trashList: () => request("GET", "trashList"),
		restore: (paths) => request("POST", "restore", { body: { paths } }),
		erase: (paths) => request("POST", "erase", { body: { paths } }),
		touch: (path) => request("POST", "touch", { body: { path } }),
		home: () => info.home,
		cwd: () => info.cwd,
		root: () => info.root,
	}
}

export { apiToken, createHttpFs }

// EOF
