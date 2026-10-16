// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/server
// Development server for the web view. Serves `public/` and exposes a JSON
// filesystem API (`/api/*`) over the Node filesystem adapter, so browsers
// without OPFS (or users who want to browse real files) can run the web UI.
//
// Security: binds to loopback only by default (`HOST` overrides the address)
// and requires the per-process token, injected into `index.html` at serve
// time, on every API request. When `root` is set, every path is confined to
// it. This is a local development
// tool, not a sandbox: it serves the same files `bun run tcmd` can reach, so
// do not expose the port.

import nodeFs from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path"
import { createNodeFs } from "../core/fs.js"

// Constant: TOKEN_PLACEHOLDER
// Value replaced in `index.html` when the page is served.
const TOKEN_PLACEHOLDER = "__TCMD_TOKEN__"

// Function: createWebServer
// Builds the server. `port` 0 picks a free port (tests); `root` defaults to
// "/" (the whole filesystem, like the TUI); `token` defaults to a fresh UUID.
// `hostname` and `port` default to the HOST and PORT environment variables.
function createWebServer({
	root = process.env.TCMD_WEB_ROOT ?? "/",
	port = Number(process.env.PORT ?? 8787),
	hostname = process.env.HOST || "127.0.0.1",
	publicDir = new URL("../../../../public/", import.meta.url),
	token = crypto.randomUUID(),
} = {}) {
	const fs = createNodeFs()
	const base = resolvePath(root)
	const rootHref = publicDir instanceof URL ? publicDir : new URL(`${publicDir.replace(/\/?$/, "/")}`, "file:///")
	let realBasePromise

	// Function: withinRoot
	// True when `path` is the configured root or inside it.
	function withinRoot(path) {
		if (typeof path !== "string" || !path) return false
		const resolved = resolvePath(path)
		return isWithin(base, resolved)
	}

	// Function: confine
	// Resolves a client path and rejects lexical or symlink escapes from root.
	async function confine(path) {
		if (typeof path !== "string" || !path) throw httpError(400, "missing path")
		const resolved = resolvePath(path)
		if (!withinRoot(resolved)) throw httpError(403, `path outside ${base}`)
		realBasePromise ??= nodeFs.realpath(base)
		const realBase = await realBasePromise
		const candidate = resolvePath(realBase, relative(base, resolved))
		await checkSymlinks(candidate, realBase)
		return resolved
	}

	// Function: checkSymlinks
	// Resolves each existing symlink component and ensures its target stays in
	// root. Dangling links are checked too, so a later write cannot follow one
	// outside the configured tree.
	async function checkSymlinks(path, realBase, seen = new Set()) {
		if (!isWithin(realBase, path)) throw httpError(403, `path outside ${base}`)
		let current = realBase
		for (const part of relative(realBase, path).split(sep).filter(Boolean)) {
			current = resolvePath(current, part)
			let stats
			try {
				stats = await nodeFs.lstat(current)
			} catch (error) {
				if (error?.code === "ENOENT") return
				throw error
			}
			if (!stats.isSymbolicLink()) continue
			if (seen.has(current) || seen.size >= 40) throw httpError(403, "symbolic link loop")
			const nextSeen = new Set(seen)
			nextSeen.add(current)
			const target = resolvePath(dirname(current), await nodeFs.readlink(current))
			await checkSymlinks(target, realBase, nextSeen)
			current = target
		}
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
		"GET /api/readDir": async (_request, url) => fs.readDir(await confine(url.searchParams.get("path"))),
		"GET /api/stat": async (_request, url) => fs.stat(await confine(url.searchParams.get("path"))),
		"GET /api/readTextHead": async (_request, url) => {
			const path = await confine(url.searchParams.get("path"))
			const maxBytes = clampBytes(url.searchParams.get("maxBytes"))
			return fs.readTextHead(path, maxBytes)
		},
		"GET /api/du": async (_request, url) => fs.du(await confine(url.searchParams.get("path"))),
		"GET /api/disk": async (_request, url) => fs.disk(await confine(url.searchParams.get("path"))),
		"POST /api/copy": async (request) => {
			const body = await jsonBody(request)
			const [from, to] = await Promise.all([confine(body.from), confine(body.to)])
			return fs.copy(from, to)
		},
		"POST /api/move": async (request) => {
			const body = await jsonBody(request)
			const [from, to] = await Promise.all([confine(body.from), confine(body.to)])
			return fs.move(from, to)
		},
		"POST /api/mkdir": async (request) => {
			const body = await jsonBody(request)
			return fs.mkdir(await confine(body.path))
		},
		"POST /api/trash": async (request) => {
			const body = await jsonBody(request)
			return fs.trash(await confinePaths(body.paths))
		},
		"GET /api/trashList": async () => (await fs.trashList()).filter((row) => withinRoot(row.originalPath)),
		"POST /api/restore": async (request) => {
			const body = await jsonBody(request)
			if (!Array.isArray(body.paths)) throw httpError(400, "expected a paths array")
			// Only trash entries whose original destinations are inside this
			// server's root are visible or restorable.
			const known = new Set((await fs.trashList()).filter((row) => withinRoot(row.originalPath)).map((row) => row.trashPath))
			for (const path of body.paths) {
				if (!known.has(path)) throw httpError(403, `unknown trash entry: ${path}`)
			}
			// Revalidate the metadata destination at the point it is used, too.
			return fs.restore(body.paths, { validateDestination: confine })
		},
		"POST /api/erase": async (request) => {
			const body = await jsonBody(request)
			return fs.erase(await confinePaths(body.paths))
		},
		"POST /api/touch": async (request) => {
			const body = await jsonBody(request)
			return fs.touch(await confine(body.path))
		},
	}

	// Function: confinePaths
	// Validates a `paths` array before a bulk operation.
	async function confinePaths(paths) {
		if (!Array.isArray(paths)) throw httpError(400, "expected a paths array")
		return Promise.all(paths.map(confine))
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
			const status = error?.status ?? (error?.code === "ENOENT" ? 404 : error?.code === "EEXIST" ? 409 : 500)
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

function isWithin(root, path) {
	const relativePath = relative(root, path)
	return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
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
