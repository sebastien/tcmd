import { describe, expect, test } from "bun:test"
import {
	createBookmarks,
	createFileBookmarkStore,
	createMemoryBookmarkStore,
	isValidName,
	normalizeName,
} from "../../src/js/tcmd/core/bookmarks.js"

describe("bookmarks", () => {
	test("names normalize and validate", () => {
		expect(normalizeName("  home ")).toBe("home")
		expect(isValidName("home")).toBe(true)
		expect(isValidName("  ")).toBe(false)
		expect(isValidName("a/b")).toBe(false)
		expect(isValidName("a b")).toBe(false)
	})

	test("record, set and remove keep the map and rows sorted", async () => {
		const bookmarks = createBookmarks()
		await bookmarks.record("zeta", "/z")
		await bookmarks.record("alpha", "/a", true)
		expect(bookmarks.entries.value).toEqual({
			zeta: { path: "/z", isDir: null },
			alpha: { path: "/a", isDir: true },
		})
		expect(bookmarks.rows().map((row) => row.name)).toEqual(["alpha", "zeta"])
		expect(bookmarks.rows().find((row) => row.name === "alpha").isDir).toBe(true)
		expect(await bookmarks.remove("alpha")).toBe(true)
		expect(await bookmarks.remove("alpha")).toBe(false)
		expect(bookmarks.entries.value).toEqual({ zeta: { path: "/z", isDir: null } })
	})

	test("record rejects an empty name", async () => {
		const bookmarks = createBookmarks()
		await expect(bookmarks.record("  ", "/a")).rejects.toThrow("name")
	})

	test("find and findByName resolve stored bookmarks", async () => {
		const bookmarks = createBookmarks()
		await bookmarks.record("home", "/home", true)
		expect(bookmarks.find("/home")).toEqual({ name: "home", path: "/home", isDir: true })
		expect(bookmarks.find("/nope")).toBeNull()
		expect(bookmarks.findByName("home")).toEqual({ name: "home", path: "/home", isDir: true })
		expect(bookmarks.findByName("nope")).toBeNull()
	})

	test("load normalizes legacy string paths and object rows", async () => {
		const store = {
			async load() {
				return { home: "/home", etc: { path: "/etc", isDir: true }, bad: 42 }
			},
			async save() {},
		}
		const bookmarks = createBookmarks({ store })
		await bookmarks.load()
		expect(bookmarks.entries.value).toEqual({
			home: { path: "/home", isDir: null },
			etc: { path: "/etc", isDir: true },
		})
	})

	test("the memory store round-trips nothing (in-memory only)", async () => {
		const store = createMemoryBookmarkStore()
		expect(await store.load()).toEqual({})
	})

	test("the file store tolerates a missing or malformed file", async () => {
		const missing = createFileBookmarkStore({
			file: "/x/bookmarks.json",
			readFile: async () => { throw new Error("ENOENT") },
			writeFile: async () => {},
		})
		expect(await missing.load()).toEqual({})

		const malformed = createFileBookmarkStore({
			file: "/x/bookmarks.json",
			readFile: async () => "not json",
			writeFile: async () => {},
		})
		expect(await malformed.load()).toEqual({})
	})

	test("the file store persists through injected fs calls", async () => {
		const writes = []
		const store = createFileBookmarkStore({
			file: "/cfg/tcmd/bookmarks.json",
			readFile: async () => JSON.stringify({ home: "/home" }),
			writeFile: async (file, text) => writes.push({ file, text }),
			mkdir: async () => {},
		})
		expect(await store.load()).toEqual({ home: "/home" })
		await store.save({ etc: "/etc" })
		expect(writes.length).toBe(1)
		expect(JSON.parse(writes[0].text)).toEqual({ etc: "/etc" })
	})
})
