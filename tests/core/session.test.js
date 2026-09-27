import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
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

	test("filesets expose non-empty tab buffers and the preview file", async () => {
		const session = makeSession()
		await load(session)
		// Cursors start on directories and no tab is marked: no filesets.
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

	test("tab.new adds a labelled tab whose buffer becomes a fileset", async () => {
		const session = makeSession()
		await load(session)
		expect(session.panes.left.tabs.value.map((tab) => tab.label)).toEqual(["A"])
		expect(session.panes.right.tabs.value.map((tab) => tab.label)).toEqual(["B"])

		session.dispatch("tab.new")
		expect(session.panes.left.tabs.value.map((tab) => tab.label)).toEqual(["A", "C"])
		await new Promise((resolve) => setTimeout(resolve, 0))
		session.dispatch("list.mark")
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$C"])
	})

	test("tab.close releases the label for reuse", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("tab.new")
		session.dispatch("tab.close")
		expect(session.panes.left.tabs.value.map((tab) => tab.label)).toEqual(["A"])
		session.dispatch("tab.new")
		expect(session.panes.left.tabs.value.map((tab) => tab.label)).toEqual(["A", "C"])
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
