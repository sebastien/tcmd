import { describe, expect, test } from "bun:test"
import { PANE_BUFFERS, PANE_LABELS, createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession, load } from "../../src/js/tcmd/core/session.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
}

function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	return createSession({ fs, left, right, host: "box" })
}

describe("session", () => {
	test("tracks the host and the active pane's directory for the header", async () => {
		const session = makeSession()
		await load(session)
		expect(session.host).toBe("box")
		expect(session.activePath.value).toBe("/home")
		session.dispatch("pane.toggle")
		expect(session.activePath.value).toBe("/")
		await session.panes.right.navigate("/home/tester")
		expect(session.activePath.value).toBe("/home/tester")
	})

	test("preview follows the active pane cursor entry", async () => {
		const session = makeSession()
		await load(session)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.preview.value).toBeNull()
		session.dispatch("nav.down")
		await new Promise((resolve) => setTimeout(resolve, 0))
		const preview = session.preview.value
		expect(preview.kind).toBe("text")
		expect(preview.title).toBe("notes.txt")
		expect(preview.text).toContain("hello")
	})

	test("command bar shows bar commands, then palette hints while open", () => {
		const session = makeSession()
		const ids = session.commandBarItems.value.map((item) => item.id)
		expect(ids).toContain("pane.toggle")
		expect(ids).not.toContain("nav.up")

		session.paletteOpen.set(true)
		const hints = session.commandBarItems.value.map((item) => item.title)
		expect(hints).toEqual(["Navigate", "Complete", "Run", "Close"])
	})

	test("palette lists every visible UI command and excludes hidden ones", () => {
		const session = makeSession()
		const ids = session.paletteItems.value.map((item) => item.id)
		expect(ids).toContain("nav.up")
		expect(ids).toContain("pane.reload")
		expect(ids).toContain("pane.toggle")
		expect(ids).not.toContain("list.cursor")
		expect(ids).not.toContain("pane.setPath")
		expect(ids).not.toContain("palette.up")
	})

	test("palette filters commands by query and resets its cursor", () => {
		const session = makeSession()
		session.paletteQuery.set("preview")
		const ids = session.paletteItems.value.map((item) => item.id)
		expect(ids).toContain("view.togglePreview")
		expect(ids).not.toContain("nav.up")

		session.paletteIndex.set(3)
		session.paletteQuery.set("switch")
		expect(session.paletteIndex.value).toBe(0)
	})

	test("palette navigation clamps to the filtered items", () => {
		const session = makeSession()
		session.paletteQuery.set("switch")
		session.dispatch("palette.down")
		expect(session.paletteIndex.value).toBe(0)
		session.dispatch("palette.up")
		expect(session.paletteIndex.value).toBe(0)
	})

	test("palette completion fills the query with the selected item", () => {
		const session = makeSession()
		session.paletteQuery.set("sw")
		session.dispatch("palette.complete")
		expect(session.paletteQuery.value).toBe("Switch")
	})

	test("filesets expose the two pane buffers and the preview file", async () => {
		const session = makeSession()
		await load(session)
		// Cursors start on directories and no pane is marked: only $FILE.
		expect(session.filesets.value).toEqual([])

		session.panes.left.cursor.set(1) // notes.txt
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$FILE"])
		expect(session.filesets.value[0].paths).toEqual(["/home/notes.txt"])

		session.dispatch("list.mark")
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$A", "$FILE"])

		session.dispatch("pane.toggle")
		session.dispatch("list.mark") // marks /home in the right pane
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$A", "$B"])
	})

	test("record defaults the name to the basename and tracks the kind", async () => {
		const session = makeSession()
		await load(session)
		session.panes.left.cursor.set(1) // notes.txt
		session.dispatch("bookmark.record")
		expect(session.bookmarkOpen.value).toBe(true)
		expect(session.bookmarkMode.value).toBe("name")
		expect(session.bookmarkTarget.value).toEqual({ path: "/home/notes.txt", isDir: false })
		// The name is pre-filled with the basename.
		expect(session.bookmarkQuery.value).toBe("notes.txt")

		session.dispatch("bookmark.save")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.bookmarks.entries.value).toEqual({
			"notes.txt": { path: "/home/notes.txt", isDir: false },
		})
		expect(session.bookmarkOpen.value).toBe(false)
	})

	test("record tracks the directory kind for a directory entry", async () => {
		const session = makeSession()
		await load(session)
		session.panes.left.cursor.set(0) // tester/ directory
		session.dispatch("bookmark.record")
		expect(session.bookmarkTarget.value).toEqual({ path: "/home/tester", isDir: true })
		expect(session.bookmarkQuery.value).toBe("tester")
	})

	test("record skips a path that is already bookmarked", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.panes.left.cursor.set(1) // notes.txt
		session.dispatch("bookmark.record")
		// Already bookmarked: no name prompt, just a notice.
		expect(session.bookmarkOpen.value).toBe(false)
		expect(session.notice.value.text).toContain("notes")
	})

	test("save refuses an empty name", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("bookmark.record")
		session.bookmarkQuery.set("   ")
		session.dispatch("bookmark.save")
		expect(session.notice.value.kind).toBe("warning")
		expect(session.bookmarks.entries.value).toEqual({})
	})

	test("jump to a directory bookmark opens it", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("tester", "/home/tester", true)
		session.dispatch("bookmark.jump")
		expect(session.bookmarkOpen.value).toBe(true)
		expect(session.bookmarkItems.value).toEqual([
			{ name: "tester", path: "/home/tester", isDir: true },
		])
		await session.dispatch("bookmark.select")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		expect(session.bookmarkOpen.value).toBe(false)
	})

	test("jump to a file bookmark selects and previews it", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.dispatch("bookmark.jump")
		await session.dispatch("bookmark.select")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
		expect(session.panes.left.currentEntry().path).toBe("/home/notes.txt")
		expect(session.showPreview.value).toBe(true)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.preview.value?.title).toBe("notes.txt")
	})

	test("the picker fuzzy-matches bookmarks by name and path", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("home", "/home", true)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.dispatch("bookmark.jump")
		session.bookmarkQuery.set("notes")
		expect(session.bookmarkItems.value.map((row) => row.name)).toEqual(["notes"])
		// A path-only match still finds the bookmark.
		session.bookmarkQuery.set("notes.txt")
		expect(session.bookmarkItems.value.map((row) => row.name)).toEqual(["notes"])
	})

	test("pane identity: labels are SRC/DST and buffers A/B", () => {
		expect(PANE_LABELS).toEqual({ left: "SRC", right: "DST" })
		expect(PANE_BUFFERS).toEqual({ left: "A", right: "B" })
	})

	test("script mode completes active-directory and nested paths", async () => {
		const session = makeSession()
		await load(session)
		session.paletteMode.set("script")

		session.paletteQuery.set("copy no")
		const flat = session.paletteItems.value.filter((row) => row.kind === "path")
		expect(flat.map((row) => row.title)).toEqual(["notes.txt"])
		expect(flat[0].completion).toBe("copy notes.txt")

		session.paletteQuery.set("copy tester/")
		await new Promise((resolve) => setTimeout(resolve, 0))
		const nested = session.paletteItems.value.filter((row) => row.kind === "path")
		expect(nested.map((row) => row.title)).toEqual(["notes.txt"])
		expect(nested[0].completion).toBe("copy tester/notes.txt")
	})
})
