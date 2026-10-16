// HTTP fs adapter: request shaping (routes, params, token, JSON bodies) and
// payload/error mapping, against an injected fetch.

import { describe, expect, test } from "bun:test"
import { apiToken, createHttpFs } from "../../src/js/tcmd/web/http.js"

function fakeFetch(handler) {
	const impl = async (url, init = {}) => {
		const call = {
			url: `${url}`,
			method: init.method ?? "GET",
			headers: init.headers ?? {},
			body: init.body,
		}
		impl.calls.push(call)
		return handler(call)
	}
	impl.calls = []
	return impl
}

function jsonResponse(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	})
}

const INFO = { root: "/root", home: "/root/home", cwd: "/root/home/tester" }

async function makeFs(handler, options = {}) {
	const impl = fakeFetch((call) => (call.url.endsWith("/info") ? jsonResponse(INFO) : handler(call)))
	const fs = await createHttpFs({ base: "http://api.test/api", token: "secret", fetch: impl, ...options })
	return { fs, impl }
}

describe("http fs adapter", () => {
	test("reads /api/info at boot and reports root/home/cwd", async () => {
		const { fs, impl } = await makeFs(() => jsonResponse({}))
		expect(impl.calls[0].url).toBe("http://api.test/api/info")
		expect(impl.calls[0].headers["x-tcmd-token"]).toBe("secret")
		expect(fs.home()).toBe("/root/home")
		expect(fs.cwd()).toBe("/root/home/tester")
		expect(fs.root()).toBe("/root")
	})

	test("reads map to GET routes with encoded paths", async () => {
		const { fs, impl } = await makeFs((call) => {
			if (call.url.includes("/readDir")) return jsonResponse([{ name: "a", isDir: false }])
			throw new Error(`unexpected ${call.url}`)
		})
		const entries = await fs.readDir("/home/tester a")
		expect(entries[0].name).toBe("a")
		const call = impl.calls[1]
		expect(call.method).toBe("GET")
		const url = new URL(call.url)
		expect(url.pathname).toBe("/api/readDir")
		expect(url.searchParams.get("path")).toBe("/home/tester a")
	})

	test("stat, readTextHead, du and disk unwrap their payloads", async () => {
		const payloads = {
			stat: { isDir: false, size: 12 },
			readTextHead: "hello",
			du: 34,
			disk: { free: 1, total: 2 },
		}
		const { fs } = await makeFs((call) => jsonResponse(payloads[new URL(call.url).pathname.split("/").pop()]))
		expect(await fs.stat("/a")).toEqual({ isDir: false, size: 12 })
		expect(await fs.isDir("/a")).toBe(false)
		expect(await fs.readTextHead("/a", 64)).toBe("hello")
		expect(await fs.du("/a")).toBe(34)
		expect(await fs.disk("/a")).toEqual({ free: 1, total: 2 })
	})

	test("mutations post JSON bodies to their routes", async () => {
		const { fs, impl } = await makeFs(() => jsonResponse({ ok: true }))
		await fs.copy("/a", "/b")
		await fs.move("/a", "/c")
		await fs.trash(["/a"])
		await fs.erase(["/a", "/b"])
		await fs.touch("/a")
		const [copy, move, trash, erase, touch] = impl.calls.slice(1)
		expect(copy.method).toBe("POST")
		expect(copy.url).toBe("http://api.test/api/copy")
		expect(copy.headers["content-type"]).toBe("application/json")
		expect(JSON.parse(copy.body)).toEqual({ from: "/a", to: "/b" })
		expect(JSON.parse(move.body)).toEqual({ from: "/a", to: "/c" })
		expect(JSON.parse(trash.body)).toEqual({ paths: ["/a"] })
		expect(JSON.parse(erase.body)).toEqual({ paths: ["/a", "/b"] })
		expect(JSON.parse(touch.body)).toEqual({ path: "/a" })
		expect(touch.headers["x-tcmd-token"]).toBe("secret")
	})

	test("mkdir, trashList and restore shape their requests", async () => {
		const { fs, impl } = await makeFs(() => jsonResponse({ ok: true }))
		await fs.mkdir("/a")
		await fs.trashList()
		await fs.restore(["/t/a"])
		const [mkdir, list, restore] = impl.calls.slice(1)
		expect(mkdir.method).toBe("POST")
		expect(mkdir.url).toBe("http://api.test/api/mkdir")
		expect(JSON.parse(mkdir.body)).toEqual({ path: "/a" })
		expect(list.method).toBe("GET")
		expect(list.url).toBe("http://api.test/api/trashList")
		expect(restore.method).toBe("POST")
		expect(restore.url).toBe("http://api.test/api/restore")
		expect(JSON.parse(restore.body)).toEqual({ paths: ["/t/a"] })
	})

	test("API errors surface their message; unreachable API gets a hint", async () => {
		const { fs } = await makeFs(() => jsonResponse({ error: "path outside /root" }, 403))
		await expect(fs.stat("/etc/passwd")).rejects.toThrow("path outside /root")
		const unreachable = createHttpFs({
			base: "http://api.test/api",
			fetch: async () => {
				throw new TypeError("connection refused")
			},
		})
		await expect(unreachable).rejects.toThrow("bun run web:serve")
	})

	test("apiToken reads the injected meta tag and rejects the placeholder", () => {
		const meta = (content) => ({ querySelector: () => ({ getAttribute: () => content }) })
		expect(apiToken(meta("abc123"))).toBe("abc123")
		expect(apiToken(meta("__TCMD_TOKEN__"))).toBeNull()
		expect(apiToken(meta(""))).toBeNull()
		expect(apiToken({})).toBeNull()
	})
})
