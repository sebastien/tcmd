import { describe, expect, test } from "bun:test"
import { createBookmarks } from "../../src/js/tcmd/core/bookmarks.js"
import { createWebBookmarkStore } from "../../src/js/tcmd/web/bookmarks.js"

function memoryStorage() {
	const entries = new Map()
	return {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => entries.set(key, value),
	}
}

describe("browser bookmarks", () => {
	test("file/directory kinds survive reload, isolated by backend and API root", async () => {
		const storage = memoryStorage()
		const store = (mode, root) => createWebBookmarkStore({ storage, mode, root })
		const model = createBookmarks({ store: store("http", "/workspace") })
		await model.record("notes", "/workspace/notes.txt", false)
		await model.record("home", "/workspace/home", true)
		const reloaded = createBookmarks({ store: store("http", "/workspace") })
		await reloaded.load()
		expect(reloaded.entries.value).toEqual(model.entries.value)
		expect(await store("opfs", "/workspace").load()).toEqual({})
		expect(await store("http", "/other").load()).toEqual({})
		await reloaded.remove("notes")
		expect(await store("http", "/workspace").load()).toEqual({ home: { path: "/workspace/home", isDir: true } })
	})

	test("malformed or denied storage leaves in-memory bookmarks usable", async () => {
		const malformed = createWebBookmarkStore({ storage: { getItem: () => "{" } })
		expect(await malformed.load()).toEqual({})
		const denied = () => { throw new Error("storage denied") }
		const store = createWebBookmarkStore({ storage: { getItem: denied, setItem: denied } })
		const model = createBookmarks({ store })
		await model.load()
		await model.record("notes", "/notes.txt", false)
		expect(model.entries.value.notes).toEqual({ path: "/notes.txt", isDir: false })
	})
})
