import { describe, expect, test } from "bun:test"
import {
	createBookmarks,
	createFileBookmarkStore,
	createMemoryBookmarkStore,
	isValidName,
	normalizeName,
	suggestName,
	uniqueName,
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

	test("suggestName derives a valid, readable basename", () => {
		expect(suggestName("/home/notes.txt")).toBe("notes.txt")
		expect(suggestName("/home/My Docs")).toBe("My-Docs")
		// The filesystem root has no segment to borrow.
		expect(suggestName("/")).toBe("bookmark")
		expect(uniqueName({ home: {} }, "home")).toBe("home-2")
		expect(uniqueName({ home: {}, "home-2": {} }, "home")).toBe("home-3")
	})

	test("add auto-names, disambiguates and leaves existing paths alone", async () => {
		const bookmarks = createBookmarks()
		expect(await bookmarks.add("/home/notes.txt", false)).toEqual({ name: "notes.txt", added: true })
		expect(await bookmarks.add("/home/notes.txt", false)).toEqual({ name: "notes.txt", added: false })
		expect(await bookmarks.add("/tmp/notes.txt", false)).toEqual({ name: "notes.txt-2", added: true })
		expect(await bookmarks.add("/", true)).toEqual({ name: "bookmark", added: true })
		expect(bookmarks.entries.value["notes.txt-2"]).toEqual({ path: "/tmp/notes.txt", isDir: false })
		expect(bookmarks.entries.value.bookmark).toEqual({ path: "/", isDir: true })
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
