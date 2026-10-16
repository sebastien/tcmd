// Web server: the static page (with the injected API token) plus the `/api/*`
// filesystem endpoints, exercised over real HTTP on an ephemeral port.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { createNodeFs } from "../../src/js/tcmd/core/fs.js"
import { createHttpFs } from "../../src/js/tcmd/web/http.js"
import { createWebServer } from "../../src/js/tcmd/web/server.js"

let server
let root
let origin
let previousDataHome
const TOKEN = "test-token"

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "tcmd-web-"))
	previousDataHome = process.env.XDG_DATA_HOME
	process.env.XDG_DATA_HOME = join(root, "xdg")
	await mkdir(join(root, "home", "tester"), { recursive: true })
	await writeFile(join(root, "home", "tester", "notes.txt"), "hello\nworld\n")
	await writeFile(join(root, "README.md"), "# root readme\n")
	;({ server } = createWebServer({ root, port: 0, token: TOKEN }))
	origin = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
	await server?.stop(true)
	await rm(root, { recursive: true, force: true })
	if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
	else process.env.XDG_DATA_HOME = previousDataHome
})

async function api(route, { params, method = "GET", body, token = TOKEN } = {}) {
	const url = new URL(`${origin}/api/${route}`)
	for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, `${value}`)
	const headers = {}
	if (token) headers["x-tcmd-token"] = token
	if (body !== undefined) headers["content-type"] = "application/json"
	return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

describe("web server", () => {
	test("serves the host page with the API token injected", async () => {
		const response = await fetch(`${origin}/`)
		expect(response.headers.get("content-type")).toContain("text/html")
		const html = await response.text()
		expect(html).toContain('id="app"')
		expect(html).toContain(`content="${TOKEN}"`)
		expect(html).not.toContain("__TCMD_TOKEN__")
	})

	test("requires the token on /api/*", async () => {
		expect((await api("info", { token: null })).status).toBe(403)
		expect((await api("info", { token: "wrong" })).status).toBe(403)
		expect((await api("nope", { token: null })).status).toBe(403)
	})

	test("reports the root/home/cwd", async () => {
		const info = await (await api("info")).json()
		expect(info.root).toBe(root)
		// home and cwd are outside the confined root, so both fall back to it.
		expect(info.home).toBe(root)
		expect(info.cwd).toBe(root)
	})

	test("reads directories, stats, text heads and sizes", async () => {
		const entries = await (await api("readDir", { params: { path: root } })).json()
		const names = entries.map((entry) => entry.name).sort()
		expect(names).toEqual(["README.md", "home"])
		const stat = await (await api("stat", { params: { path: join(root, "README.md") } })).json()
		expect(stat.isDir).toBe(false)
		expect(stat.size).toBe("# root readme\n".length)
		expect(await (await api("stat", { params: { path: join(root, "gone") } })).json()).toBeNull()
		const text = await (await api("readTextHead", { params: { path: join(root, "README.md"), maxBytes: 8 } })).json()
		expect(text).toBe("# root r")
		const size = await (await api("du", { params: { path: root } })).json()
		expect(size).toBe("# root readme\n".length + "hello\nworld\n".length)
	})

	test("applies mutations and maps missing paths to 404", async () => {
		const notes = join(root, "home", "tester", "notes.txt")
		const copy = join(root, "home", "tester", "copy.txt")
		const moved = join(root, "home", "tester", "moved.txt")
		expect((await api("copy", { method: "POST", body: { from: notes, to: copy } })).status).toBe(200)
		expect(await readFile(copy, "utf8")).toBe("hello\nworld\n")
		expect((await api("move", { method: "POST", body: { from: copy, to: moved } })).status).toBe(200)
		expect(await readFile(moved, "utf8")).toBe("hello\nworld\n")
		const fresh = join(root, "home", "tester", "fresh.txt")
		expect((await api("touch", { method: "POST", body: { path: fresh } })).status).toBe(200)
		expect(await readFile(fresh, "utf8")).toBe("")
		expect((await api("trash", { method: "POST", body: { paths: [fresh] } })).status).toBe(200)
		await expect(readFile(fresh, "utf8")).rejects.toThrow()
		const dir = join(root, "home", "tester", "newdir")
		expect((await api("mkdir", { method: "POST", body: { path: dir } })).status).toBe(200)
		expect((await api("stat", { params: { path: dir } })).json()).resolves.toMatchObject({ isDir: true })
		expect((await api("readDir", { params: { path: join(root, "nope") } })).status).toBe(404)
	})

	test("lists the trash and restores an entry", async () => {
		const fresh = join(root, "home", "tester", "undelete.txt")
		await writeFile(fresh, "keep me")
		await api("trash", { method: "POST", body: { paths: [fresh] } })
		const rows = await (await api("trashList")).json()
		const row = rows.find((candidate) => candidate.originalPath === fresh)
		expect(row).toBeTruthy()
		// Only a known trash path may be restored.
		expect((await api("restore", { method: "POST", body: { paths: ["/nope"] } })).status).toBe(403)
		await writeFile(fresh, "replacement")
		expect((await api("restore", { method: "POST", body: { paths: [row.trashPath] } })).status).toBe(409)
		expect(await readFile(fresh, "utf8")).toBe("replacement")
		await rm(fresh)
		expect((await api("restore", { method: "POST", body: { paths: [row.trashPath] } })).status).toBe(200)
		expect(await readFile(fresh, "utf8")).toBe("keep me")
	})

	test("confines paths to the configured root", async () => {
		expect((await api("stat", { params: { path: "/etc/passwd" } })).status).toBe(403)
		expect((await api("stat", { params: { path: `${root}/../outside` } })).status).toBe(403)
		expect((await api("erase", { method: "POST", body: { paths: ["/etc/passwd"] } })).status).toBe(403)
	})

	test("confines paths reached through symlinks", async () => {
		const outside = join(root, "..", `${basename(root)}-symlink-target.txt`)
		const link = join(root, "escape.txt")
		const internalLink = join(root, "internal-home")
		await writeFile(outside, "outside root")
		await symlink(outside, link)
		await symlink(join(root, "home", "tester"), internalLink)

		expect((await api("stat", { params: { path: link } })).status).toBe(403)
		expect((await api("readTextHead", { params: { path: link } })).status).toBe(403)
		expect((await api("erase", { method: "POST", body: { paths: [link] } })).status).toBe(403)
		const entries = await (await api("readDir", { params: { path: internalLink } })).json()
		expect(entries.map((entry) => entry.name)).toContain("notes.txt")
		expect(await readFile(outside, "utf8")).toBe("outside root")
	})

	test("trash listing and restore stay inside the configured root", async () => {
		const outside = join(root, "..", `${basename(root)}-outside.txt`)
		await writeFile(outside, "outside root")
		const [entry] = await createNodeFs().trash([outside])

		const rows = await (await api("trashList")).json()
		expect(rows.some((row) => row.trashPath === entry.to)).toBe(false)
		expect((await api("restore", { method: "POST", body: { paths: [entry.to] } })).status).toBe(403)
		expect(await createNodeFs().stat(outside)).toBeNull()
	})

	test("drives the HTTP adapter end to end", async () => {
		const fs = await createHttpFs({ base: `${origin}/api`, token: TOKEN })
		expect(fs.root()).toBe(root)
		const names = (await fs.readDir(root)).map((entry) => entry.name)
		expect(names).toContain("README.md")
		expect(await fs.readTextHead(join(root, "README.md"))).toBe("# root readme\n")
		await fs.copy(join(root, "README.md"), join(root, "copy.md"))
		expect(await fs.isDir(join(root, "home"))).toBe(true)
		await fs.erase([join(root, "copy.md")])
		expect(await fs.stat(join(root, "copy.md"))).toBeNull()
	})

	test("rejects malformed mutation bodies", async () => {
		const wrongType = await fetch(`${origin}/api/touch`, {
			method: "POST",
			headers: { "x-tcmd-token": TOKEN, "content-type": "text/plain" },
			body: "path=/etc/passwd",
		})
		expect(wrongType.status).toBe(415)
		const malformed = await fetch(`${origin}/api/touch`, {
			method: "POST",
			headers: { "x-tcmd-token": TOKEN, "content-type": "application/json" },
			body: "{",
		})
		expect(malformed.status).toBe(400)
	})
})
