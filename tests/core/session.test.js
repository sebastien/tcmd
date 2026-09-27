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
	return createSession({ fs, left, right })
}

describe("session", () => {
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

	test("toolbar cell only holds commands flagged for the toolbar", () => {
		const session = makeSession()
		const ids = session.toolbarCommands.value.map((item) => item.id)
		expect(ids).toContain("pane.toggle")
		expect(ids).not.toContain("nav.up")
	})

	test("palette lists every visible command and excludes hidden ones", () => {
		const session = makeSession()
		const ids = session.paletteItems.value.map((item) => item.id)
		expect(ids).toContain("nav.up")
		expect(ids).toContain("pane.reload")
		expect(ids).toContain("pane.toggle")
		expect(ids).not.toContain("list.cursor")
		expect(ids).not.toContain("pane.setPath")
	})

	test("palette filters commands by query", () => {
		const session = makeSession()
		session.paletteQuery.set("preview")
		const ids = session.paletteItems.value.map((item) => item.id)
		expect(ids).toContain("view.togglePreview")
		expect(ids).not.toContain("nav.up")
	})
})
