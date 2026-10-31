// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/server
// Development server for the web view. Serves `public/` and exposes a JSON
// filesystem API (`/api/*`) over the Node filesystem adapter, so browsers
// without OPFS (or users who want to browse real files) can run the web UI.
// `startWebServer` builds a missing browser bundle and reports the listening
// URL; both the CLI launcher and TUI host use it. `createWebServer` only binds
// the static/API server, without building assets or printing startup output.
//
// Security: binds to loopback only by default (`HOST` overrides the address)
// and requires the per-process token in the page URL before injecting it into
// `index.html`; every API request must then carry it in a header. When `root` is set, every path is confined to
// it. This is a local development
// tool, not a sandbox: it serves the same files `bun run tcmd` can reach, so
// do not expose the port.

import nodeFs from "node:fs/promises"
import { isIP } from "node:net"
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { encodeBase64 } from "../core/base64.js"
import { createNodeFs } from "../core/fs.js"

// Constant: TOKEN_PLACEHOLDER
// Value replaced in `index.html` when the page is served.
const TOKEN_PLACEHOLDER = "__TCMD_TOKEN__"

// Function: hostUrl
// The URL a client should open. IPv6 literals (possibly zone-qualified) are
// bracketed so the result is a valid URL.
function hostUrl(hostname, port) {
	const host = isIP(hostname) === 6 ? `[${hostname}]` : hostname
	return `http://${host}:${port}`
}

// Function: startWebServer
// Starts the web server. Published packages include the browser bundle; a
// source checkout builds it on demand, independently of the caller's cwd.
// `quiet` suppresses startup output for the TUI; `url` is the base address,
// while `token` authenticates the page link and subsequent API requests.
async function startWebServer(options = {}) {
	const publicDir = options.publicDir ?? new URL("../../../../public/", import.meta.url)
	if (!(await Bun.file(new URL("main.js", publicDir)).exists())) {
		const build = await Bun.build({
			entrypoints: [fileURLToPath(new URL("./main.js", import.meta.url))],
			outdir: fileURLToPath(publicDir),
			target: "browser",
		})
		if (!build.success) throw new AggregateError(build.logs, "Could not build the web UI")
	}
	const result = createWebServer({ ...options, publicDir })
	const host = result.server.hostname
	const url = hostUrl(host, result.server.port)
	if (!options.quiet) {
		// A machine name resolves to several addresses, but the server binds
		// only one of them, so prefer an IP literal.
		if (host !== "127.0.0.1" && host !== "localhost" && isIP(host) === 0) {
			console.warn(
				`tcmd web:      warning: ${host} is a name; bound to one of its addresses only.\n` +
					`                Use an IP literal instead (0.0.0.0 or :: for every interface).`
			)
		}
		console.log(`tcmd web:      ${url}/?token=${encodeURIComponent(result.token)}`)
		console.log(`filesystem API: /api/* rooted at ${result.root}`)
		console.log("append &fs=http for your files, or &fs=opfs for browser storage")
	}
	return { ...result, url }
}

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

	// Function: confineSymlinkTarget
	// Validates a symlink target without rewriting it: an absolute target is
	// resolved as-is, a relative one against the link's directory, and either
	// must stay inside the configured root. The original target text is passed
	// to `fs.symlink`, so relative links keep working if the tree moves.
	function confineSymlinkTarget(target, link) {
		if (typeof target !== "string" || !target) throw httpError(400, "missing target")
		const resolved = isAbsolute(target) ? resolvePath(target) : resolvePath(dirname(link), target)
		if (!isWithin(base, resolved)) throw httpError(403, `target outside ${base}`)
		return target
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
		"GET /api/realpath": async (_request, url) => fs.realpath(await confine(url.searchParams.get("path"))),
		"GET /api/readTextHead": async (_request, url) => {
			const path = await confine(url.searchParams.get("path"))
			const maxBytes = clampBytes(url.searchParams.get("maxBytes"))
			return fs.readTextHead(path, maxBytes)
		},
		"GET /api/readBytes": async (_request, url) => {
			const path = await confine(url.searchParams.get("path"))
			const maxBytes = clampBytes(url.searchParams.get("maxBytes"))
			return { base64: encodeBase64(await fs.readBytes(path, maxBytes)) }
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
		"POST /api/hardlink": async (request) => {
			const body = await jsonBody(request)
			const [from, to] = await Promise.all([confine(body.from), confine(body.to)])
			return fs.hardlink(from, to)
		},
		"POST /api/symlink": async (request) => {
			const body = await jsonBody(request)
			const link = await confine(body.link)
			return fs.symlink(confineSymlinkTarget(body.target, link), link)
		},
		"POST /api/chmod": async (request) => {
			const body = await jsonBody(request)
			const mode = Number(body.mode)
			if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw httpError(400, "invalid mode")
			return fs.chmod(await confine(body.path), mode)
		},
		"POST /api/chown": async (request) => {
			const body = await jsonBody(request)
			if (typeof body.owner !== "string" || !body.owner) throw httpError(400, "missing owner")
			return fs.chown(await confine(body.path), body.owner)
		},
		"POST /api/unlink": async (request) => {
			const body = await jsonBody(request)
			return fs.unlink(await confine(body.path))
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
		if (path === "/index.html" && url.searchParams.get("token") !== token) {
			return new Response("Invalid or missing token. Open the token link from the terminal or toolbar.", {
				status: 403,
				headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
			})
		}
		const target = new URL(`.${path}`, rootHref)
		if (!target.href.startsWith(rootHref.href)) return new Response("Not found", { status: 404 })
		const file = Bun.file(target)
		if (!(await file.exists())) return new Response("Not found", { status: 404 })
		if (path === "/index.html") {
			const html = (await file.text()).replaceAll(TOKEN_PLACEHOLDER, token)
			return new Response(html, {
				headers: { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer" },
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

export { createWebServer, hostUrl, startWebServer, TOKEN_PLACEHOLDER }

// EOF
