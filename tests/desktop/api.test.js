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
			return method === "fsStat" ? { isDir: true } : true
		}
		const fs = await createDesktopFs({ call })
		expect(fs.home()).toBe("/home/test")
		expect(fs.cwd()).toBe("/work")
		expect(await fs.isDir("/work")).toBe(true)
		await fs.move("/work/a", "/work/b")
		expect(requests).toEqual([
			["fsInfo", undefined],
			["fsStat", { path: "/work" }],
			["fsMove", { from: "/work/a", to: "/work/b" }],
		])
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
