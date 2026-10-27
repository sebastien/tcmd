import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createDesktopBackend, readLimited } from "../../src/js/tcmd/desktop/backend/api.js"
import { createDesktopFs } from "../../src/js/tcmd/desktop/fs.js"
import { createDesktopBookmarkStore } from "../../src/js/tcmd/desktop/bookmarks.js"
import { createNodeRuntime } from "./runtime.js"

describe("tinyjs desktop bridge", () => {
	test("exposes plain-data filesystem values and drains queued open requests", async () => {
		const root = await mkdtemp(join(import.meta.dir, ".tcmd-api-"))
		try {
			await writeFile(join(root, "note.txt"), "hello")
			const desktop = createDesktopBackend({ runtime: createNodeRuntime({ home: root, cwd: root }) })
			const info = await desktop.api.fsInfo()
			expect(info).toMatchObject({ home: root, cwd: root, root: "/", host: "desktop-test" })
			expect(await desktop.api.fsStat({ path: join(root, "note.txt") })).toMatchObject({
				isDir: false,
				size: 5,
				mtimeMs: expect.any(Number),
			})
			expect(await desktop.api.fsRealpath({ path: join(root, "note.txt") })).toBe(join(root, "note.txt"))
			expect(await desktop.api.fsReadBytes({ path: join(root, "note.txt"), maxBytes: 2 })).toEqual({
				base64: "aGU=",
			})

			const events = []
			desktop.onOpenFiles([join(root, "note.txt")], { push: (...args) => events.push(args) })
			expect(events).toEqual([["open-files", true]])
			expect(await desktop.api.fsTakeOpenFiles()).toEqual([join(root, "note.txt")])
			expect(await desktop.api.fsTakeOpenFiles()).toEqual([])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("open and edit use the native shell bridge without command interpolation", async () => {
		const opened = []
		const desktop = createDesktopBackend({
			runtime: { cwd: "/home/test", homeDir: "/home/test", env: { OS: "Linux" } },
		})
		const app = { shell: { open: async (path) => opened.push(path) } }
		await desktop.api.hostOpen({ path: "/home/test/a file.txt" }, app)
		await desktop.api.hostEdit({ path: "/home/test/a file.txt" }, app)
		expect(opened).toEqual(["/home/test/a file.txt", "/home/test/a file.txt"])
		await desktop.api.hostOpen({ path: "javascript:alert(1)" }, app)
		expect(opened.at(-1)).toBe("/home/test/javascript:alert(1)")
		await expect(desktop.api.hostOpen({ path: "/home/test/\0bad" }, app)).rejects.toThrow("NUL")
	})

	test("runs explicit shell commands with bounded output and reports exit status", async () => {
		const root = await mkdtemp(join(import.meta.dir, ".tcmd-run-"))
		try {
			const runtime = createNodeRuntime({ home: root, cwd: root })
			const desktop = createDesktopBackend({ runtime })
			const result = await desktop.api.hostRun({
				command: "printf 'hello'; printf 'warning' >&2; exit 3",
				cwd: root,
			})
			expect(result).toMatchObject({ stdout: "hello", stderr: "warning", exitCode: 3, signal: null, truncated: false })
			await expect(desktop.api.hostRun({ command: "echo bad", cwd: "/missing" })).rejects.toThrow("not a directory")
			await expect(desktop.api.hostRun({ command: "\0" })).rejects.toThrow("NUL")
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("bridges native directory watchers and resets them per window", async () => {
		const watched = []
		const closed = []
		const runtime = {
			cwd: "/work",
			homeDir: "/work",
			env: { OS: "Linux" },
			watch(path, handler) {
				const watcher = {
					path,
					handler,
					close: () => closed.push(path),
				}
				watched.push(watcher)
				return watcher
			},
		}
		const desktop = createDesktopBackend({ runtime })
		const events = []
		const app = { push: (event, data) => events.push([event, data]) }
		const meta = { window: "main" }

		await desktop.api.fsWatch({ path: "/work/a", id: "w1" }, app, meta)
		expect(watched[0].path).toBe("/work/a")
		watched[0].handler("a.txt", "change")
		expect(events).toEqual([["fs-change", { id: "w1" }]])

		// Re-using an id closes its predecessor instead of leaking it.
		await desktop.api.fsWatch({ path: "/work/b", id: "w1" }, app, meta)
		expect(closed).toEqual(["/work/a"])
		await desktop.api.fsUnwatch({ id: "w1" }, app, meta)
		expect(closed).toEqual(["/work/a", "/work/b"])

		// A reset closes every watcher the calling window owns.
		await desktop.api.fsWatch({ path: "/work/a", id: "w1" }, app, meta)
		await desktop.api.fsWatch({ path: "/work/b", id: "w2" }, app, meta)
		await desktop.api.fsWatchReset(undefined, app, { window: "other" })
		expect(closed.length).toBe(2)
		await desktop.api.fsWatchReset(undefined, app, meta)
		expect(closed.length).toBe(4)

		expect(() => desktop.api.fsWatch({ path: "/work/a", id: "" }, app, meta)).toThrow("watch id")
	})

	test("limits returned process output while continuing to drain the stream", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("123456"))
				controller.enqueue(new TextEncoder().encode("789"))
				controller.close()
			},
		})
		expect(await readLimited(stream, 5)).toEqual({ text: "12345", truncated: true })
	})

	test("frontend adapter forwards the shared filesystem contract over RPC", async () => {
		const requests = []
		const call = async (method, params) => {
			requests.push([method, params])
			if (method === "fsInfo") return { home: "/home/test", cwd: "/work", root: "/", host: "test" }
			if (method === "fsStat") return { isDir: true }
			if (method === "fsRealpath") return "/work/a"
			return true
		}
		const fs = await createDesktopFs({ call })
		expect(fs.home()).toBe("/home/test")
		expect(fs.cwd()).toBe("/work")
		expect(await fs.isDir("/work")).toBe(true)
		expect(await fs.realpath("/work/a")).toBe("/work/a")
		await fs.move("/work/a", "/work/b")
		expect(requests).toEqual([
			["fsInfo", undefined],
			["fsStat", { path: "/work" }],
			["fsRealpath", { path: "/work/a" }],
			["fsMove", { from: "/work/a", to: "/work/b" }],
		])
	})

	test("frontend adapter exposes native watchers over the push channel", async () => {
		const requests = []
		let push = null
		const call = async (method, params) => {
			requests.push([method, params])
			if (method === "fsInfo") return { home: "/home/test", cwd: "/work", root: "/", host: "test" }
			return true
		}
		const fs = await createDesktopFs({
			call,
			on: (event, handler) => {
				if (event === "fs-change") push = handler
			},
		})
		// A page reload drops the watchers the previous page left behind.
		expect(requests.slice(0, 2)).toEqual([
			["fsInfo", undefined],
			["fsWatchReset", undefined],
		])

		const changes = []
		const stop = await fs.watch("/work", () => changes.push(1))
		const [method, params] = requests.at(-1)
		expect(method).toBe("fsWatch")
		expect(params.path).toBe("/work")
		expect(params.id).toEndWith("-1")
		push({ id: params.id })
		expect(changes.length).toBe(1)
		push({ id: "unknown" })
		expect(changes.length).toBe(1)

		stop()
		expect(requests.at(-1)).toEqual(["fsUnwatch", { id: params.id }])
		stop()
		expect(requests.filter(([name]) => name === "fsUnwatch").length).toBe(1)
		push({ id: params.id })
		expect(changes.length).toBe(1)
	})

	test("frontend adapter without a push channel reports no watcher", async () => {
		const fs = await createDesktopFs({
			call: async (method) =>
				method === "fsInfo" ? { home: "/home/test", cwd: "/work", root: "/", host: "test" } : true,
		})
		expect(await fs.watch("/work", () => {})).toBeNull()
	})

	test("frontend adapter decodes base64 byte reads", async () => {
		const fs = await createDesktopFs({
			call: async (method) =>
				method === "fsInfo" ? { home: "/home/test", cwd: "/work", root: "/", host: "test" } : { base64: "AQID" },
		})
		const bytes = await fs.readBytes("/work/a", 3)
		expect(bytes).toBeInstanceOf(Uint8Array)
		expect([...bytes]).toEqual([1, 2, 3])
	})

	test("tinyjs bookmark store reports persistence failures", async () => {
		let saved = null
		const store = createDesktopBookmarkStore({
			store: {
				async get(key) {
					expect(key).toBe("tcmd.bookmarks.v1")
					return saved
				},
				async set(_key, value) {
					saved = value
					return true
				},
			},
		})
		await store.save({ docs: { path: "/docs", isDir: true } })
		expect(await store.load()).toEqual({ docs: { path: "/docs", isDir: true } })
		const failed = createDesktopBookmarkStore({ store: { get: async () => null, set: async () => false } })
		await expect(failed.save({})).rejects.toThrow("Could not save bookmarks")
	})

})
