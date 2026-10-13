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
	// These tests exercise the commander workspace; the session opens in
	// explorer now (see the default-mode test below).
	return createSession({ fs, left, right, host: "box", viewMode: "commander" })
}

describe("session", () => {
	test("opens in explorer mode by default", () => {
		const fs = createMockFs(TREE)
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/" }) })
		expect(session.viewMode.value).toBe("explorer")
		// A caller can still ask for the two-pane commander.
		const commander = createSession({
			fs,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "commander",
		})
		expect(commander.viewMode.value).toBe("commander")
	})

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

	test("command bar shows bar commands, then panel hints while open", () => {
		const session = makeSession()
		const ids = session.commandBarItems.value.map((item) => item.id)
		expect(ids).toContain("pane.toggle")
		expect(ids).not.toContain("nav.up")

		session.panelOpen.set(true)
		const hints = session.commandBarItems.value.map((item) => item.title)
		expect(hints).toEqual(["Command", "Arg", "Browse", "Toggle", "Run", "Close"])
		// The picker sub-mode swaps in its own hints.
		session.panelPicking.set(true)
		const picker = session.commandBarItems.value.map((item) => item.title)
		expect(picker).toContain("Choose")
	})

	test("the panel lists only the CLI operations", () => {
		const session = makeSession()
		const items = session.panelItems.value
		const ids = items.map((item) => item.id)
		expect(ids).toContain("op:copy")
		// No group headers, no internal TinyCmd actions.
		expect(ids.some((id) => `${id}`.startsWith("group:"))).toBe(false)
		expect(ids.some((id) => `${id}`.startsWith("cmd:"))).toBe(false)
		// Alphabetical by name.
		const names = items.map((item) => item.name)
		expect(names).toEqual([...names].toSorted())
	})

	test("the panel filters the operations by query and resets its cursor", () => {
		const session = makeSession()
		session.panelQuery.set("copy")
		const ids = session.panelItems.value.map((item) => item.id)
		expect(ids).toEqual(["op:copy"])

		session.panelOpIndex.set(3)
		session.panelQuery.set("touch")
		expect(session.panelOpIndex.value).toBe(0)
	})

	test("a query ranks the operations by match importance", () => {
		const session = makeSession()
		session.panelQuery.set("op")
		const ids = session.panelItems.value.map((item) => item.id)
		// `open` (prefix) outranks `copy` (a subsequence match).
		expect(ids[0]).toBe("op:open")
		expect(ids).toContain("op:copy")
	})

	test("`!` lands on the shell operation with its CMD field focused", () => {
		const session = makeSession()
		session.dispatch("panel.shell")
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelEntry.value.name).toBe("run")
		// The argument pane takes the cursor, on the raw CMD field.
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelTextual.value).toBe(true)
		expect(session.panelRows.value[0].name).toBe("CMD")
		// Selecting by index, not by query: the filter stays empty.
		expect(session.panelQuery.value).toBe("")
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

	test("the preview column mirrors the previewed directory", async () => {
		const session = makeSession()
		await load(session)
		await new Promise((resolve) => setTimeout(resolve, 0))
		// The cursor starts on the `tester/` directory, so the third column
		// lists it rather than showing a card.
		expect(session.previewEntry.value?.isDir).toBe(true)
		expect(session.panes.preview.path.value).toBe("/home/tester")
		// Moving onto a file stops the column from following, but does not
		// clear the directory it was showing.
		session.panes.left.cursor.set(1)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.previewEntry.value?.isDir).toBe(false)
		expect(session.panes.preview.path.value).toBe("/home/tester")
	})

	test("focus on an auxiliary column keeps the header on the current directory", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("view.toggleMode")
		session.dispatch("pane.activate", { paneId: "parent" })
		expect(session.active.value).toBe("parent")
		expect(session.currentId.value).toBe("left")
		expect(session.activePath.value).toBe("/home")
		expect(session.previewEntry.value).toEqual(session.leftCursorEntry.value)
	})

	test("the preview follows symlinks to their target", async () => {
		const fs = createMockFs({
			"/": [{ name: "home", isDir: true }],
			"/home": [
				{ name: "real-dir", isDir: true },
				{ name: "notes.txt", text: "real content\n", size: 13 },
				{ name: "link.txt", isSymlink: true, target: "notes.txt" },
				{ name: "link-dir", isSymlink: true, target: "real-dir" },
			],
			"/home/real-dir": [{ name: "inside.txt", text: "inside", size: 6 }],
		})
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/" }) })
		await load(session)
		const index = (name) => session.panes.left.entries.value.findIndex((entry) => entry.name === name)
		const flush = async () => {
			for (let i = 0; i < 4; i++) await Promise.resolve()
			await new Promise((resolve) => setTimeout(resolve, 0))
		}

		// A link to a file previews the *target's* content, classified by the
		// target's extension, with the traversal named in the title.
		session.panes.left.cursor.set(index("link.txt"))
		await flush()
		expect(session.previewEntry.value.isSymlink).toBe(true)
		expect(session.preview.value.kind).toBe("text")
		expect(session.preview.value.title).toBe("link.txt -> notes.txt")
		expect(session.preview.value.ext).toBe("txt")
		expect(session.preview.value.text).toContain("real content")

		// A link to a directory previews as a directory: the preview column
		// follows it and lists what it points at.
		session.panes.left.cursor.set(index("link-dir"))
		await flush()
		expect(session.previewEntry.value.isDir).toBe(true)
		expect(session.preview.value).toBeNull()
		expect(session.panes.preview.path.value).toBe("/home/link-dir")
		await flush()
		expect(session.panes.preview.entries.value.map((entry) => entry.name)).toEqual(["inside.txt"])
	})

	test("pane identity: labels are SRC/DST and buffers A/B", () => {
		expect(PANE_LABELS).toEqual({ left: "SRC", right: "DST" })
		expect(PANE_BUFFERS).toEqual({ left: "A", right: "B" })
	})
})
