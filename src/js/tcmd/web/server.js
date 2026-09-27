// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/server
// Development server for the web view. Serves `public/` and exposes a JSON
// filesystem API (`/api/*`) over the Node filesystem adapter, so browsers
// without OPFS (or users who want to browse real files) can run the web UI.
//
// Security: binds to loopback only by default and requires the per-process
// token, injected into `index.html` at serve time, on every API request. When
// `root` is set, every path is confined to it. This is a local development
// tool, not a sandbox: it serves the same files `bun run tcmd` can reach, so
// do not expose the port.

import { resolve as resolvePath, sep } from "node:path"
import { createNodeFs } from "../core/fs.js"

// Constant: TOKEN_PLACEHOLDER
// Value replaced in `index.html` when the page is served.
const TOKEN_PLACEHOLDER = "__TCMD_TOKEN__"

// Function: createWebServer
// Builds the server. `port` 0 picks a free port (tests); `root` defaults to
// "/" (the whole filesystem, like the TUI); `token` defaults to a fresh UUID.
function createWebServer({
	root = process.env.TCMD_WEB_ROOT ?? "/",
	port = Number(process.env.PORT ?? 8787),
	hostname = "127.0.0.1",
	publicDir = new URL("../../../../public/", import.meta.url),
	token = crypto.randomUUID(),
} = {}) {
	const fs = createNodeFs()
	const base = resolvePath(root)
	const rootHref = publicDir instanceof URL ? publicDir : new URL(`${publicDir.replace(/\/?$/, "/")}`, "file:///")

	// Function: withinRoot
	// True when `path` is the configured root or inside it.
	function withinRoot(path) {
		const resolved = resolvePath(path)
		return base === sep || resolved === base || resolved.startsWith(base + sep)
	}

	// Function: confine
	// Resolves a client path and rejects it when it escapes the root.
	function confine(path) {
		if (typeof path !== "string" || !path) throw httpError(400, "missing path")
		const resolved = resolvePath(path)
		if (!withinRoot(resolved)) throw httpError(403, `path outside ${base}`)
		return resolved
	}

	// Function: jsonBody
	// Reads a JSON request body; other content types are refused so cross-site
	// form posts cannot reach the mutations.
	async function jsonBody(request) {
		if (!`${request.headers.get("content-type") ?? ""}`.includes("application/json")) {
			throw httpError(415, "expected an application/json body")
		}
		try {
			return await request.json()
		} catch (error) {
			throw httpError(400, "malformed JSON body")
		}
	}

	// Constant: routes
	// `METHOD /api/name` -> payload builder; the payload is wrapped in JSON.
	const routes = {
		"GET /api/info": () => ({
			root: base,
			home: withinRoot(fs.home()) ? fs.home() : base,
			cwd: withinRoot(fs.cwd()) ? fs.cwd() : base,
		}),
		"GET /api/readDir": (_request, url) => fs.readDir(confine(url.searchParams.get("path"))),
		"GET /api/stat": (_request, url) => fs.stat(confine(url.searchParams.get("path"))),
		"GET /api/readTextHead": async (_request, url) => {
			const path = confine(url.searchParams.get("path"))
			const maxBytes = clampBytes(url.searchParams.get("maxBytes"))
			return fs.readTextHead(path, maxBytes)
		},
		"GET /api/du": (_request, url) => fs.du(confine(url.searchParams.get("path"))),
		"GET /api/disk": (_request, url) => fs.disk(confine(url.searchParams.get("path"))),
		"POST /api/copy": async (request) => {
			const body = await jsonBody(request)
			return fs.copy(confine(body.from), confine(body.to))
		},
		"POST /api/move": async (request) => {
			const body = await jsonBody(request)
			return fs.move(confine(body.from), confine(body.to))
		},
		"POST /api/trash": async (request) => {
			const body = await jsonBody(request)
			return fs.trash(confinePaths(body.paths))
		},
		"POST /api/erase": async (request) => {
			const body = await jsonBody(request)
			return fs.erase(confinePaths(body.paths))
		},
		"POST /api/touch": async (request) => {
			const body = await jsonBody(request)
			return fs.touch(confine(body.path))
		},
	}

	// Function: confinePaths
	// Validates a `paths` array before a bulk operation.
	function confinePaths(paths) {
		if (!Array.isArray(paths)) throw httpError(400, "expected a paths array")
		return paths.map(confine)
	}

	// Function: handleApi
	// Auth + routing + error mapping for `/api/*`.
	async function handleApi(request, url) {
		if (request.headers.get("x-tcmd-token") !== token) {
			return json({ error: "invalid or missing token" }, 403)
		}
		const route = routes[`${request.method} ${url.pathname}`]
		if (!route) return json({ error: `unknown route: ${request.method} ${url.pathname}` }, 404)
		try {
			const value = await route(request, url)
			return json(value === undefined ? { ok: true } : value)
		} catch (error) {
			const status = error?.status ?? (error?.code === "ENOENT" ? 404 : 500)
			return json({ error: `${error?.message ?? error}` }, status)
		}
	}

	// Function: handleStatic
	// `public/` files, with the token injected into `index.html`.
	async function handleStatic(url) {
		let path
		try {
			path = decodeURIComponent(url.pathname)
		} catch (error) {
			return new Response("Bad request", { status: 400 })
		}
		if (path === "/") path = "/index.html"
		const target = new URL(`.${path}`, rootHref)
		if (!target.href.startsWith(rootHref.href)) return new Response("Not found", { status: 404 })
		const file = Bun.file(target)
		if (!(await file.exists())) return new Response("Not found", { status: 404 })
		if (path === "/index.html") {
			const html = (await file.text()).replaceAll(TOKEN_PLACEHOLDER, token)
			return new Response(html, {
				headers: { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" },
			})
		}
		return new Response(file, { headers: { "Cache-Control": "no-store" } })
	}

	const server = Bun.serve({
		hostname,
		port,
		fetch(request) {
			const url = new URL(request.url)
			if (url.pathname.startsWith("/api/")) return handleApi(request, url)
			return handleStatic(url)
		},
	})

	return { server, token, root: base }
}

// Function: json
// One-line JSON response.
function json(payload, status = 200) {
	return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}

// Function: httpError
// Error carrying the HTTP status the API should answer with.
function httpError(status, message) {
	const error = new Error(message)
	error.status = status
	return error
}

// Function: clampBytes
// `maxBytes` query parameter, bounded to 1 MiB; defaults to the preview size.
function clampBytes(value) {
	const bytes = Number(value)
	if (!Number.isFinite(bytes) || bytes <= 0) return 65536
	return Math.min(Math.floor(bytes), 1024 * 1024)
}

export { createWebServer, TOKEN_PLACEHOLDER }

// EOF
