import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession, load } from "../../src/js/tcmd/core/session.js"
import { createDispatch, getCommand, getCommands } from "../../src/js/tcmd/core/commands.js"
import { matchKeymap, DEFAULT_KEYMAP } from "../../src/js/tcmd/core/keymap.js"
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
	const session = createSession({ fs, left, right })
	return session
}

describe("commands", () => {
	test("registry is well-formed", () => {
		for (const command of getCommands()) {
			expect(command.id.length).toBeGreaterThan(0)
			expect(typeof command.run).toBe("function")
		}
		expect(getCommand("nav.up").title).toBeTruthy()
		expect(getCommand("nope")).toBeNull()
	})

	test("nav.down moves the active pane cursor", async () => {
		const session = makeSession()
		await load(session)
		expect(session.active.value).toBe("left")
		expect(session.panes.left.cursor.value).toBe(0)
		session.dispatch("nav.down")
		expect(session.panes.left.cursor.value).toBe(1)
	})

	test("pane.toggle switches the active pane", async () => {
		const session = makeSession()
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("right")
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("left")
	})

	test("pane.enter descends into the directory under the cursor", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.enter")
		await Promise.resolve()
		expect(session.panes.left.path.value).toBe("/home/tester")
	})

	test("pane.up returns to the parent", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.enter")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		session.dispatch("pane.up")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
	})

	test("list.mark toggles the mark under the cursor", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("list.mark")
		expect(session.panes.left.marked.value.size).toBe(1)
	})

	test("view.togglePreview flips showPreview", async () => {
		const session = makeSession()
		session.dispatch("view.togglePreview")
		expect(session.showPreview.value).toBe(false)
	})
})

describe("keymap", () => {
	test("matches plain and ctrl chords", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "down" })).toBe("nav.down")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "r", ctrl: true })).toBe("pane.reload")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "r" })).toBeNull()
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "f1" })).toBeNull()
	})
})

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

	test("palette filters command rows by query", async () => {
		const session = makeSession()
		session.paletteQuery.set("preview")
		const ids = session.paletteItems.value.map((item) => item.id)
		expect(ids).toContain("view.togglePreview")
		expect(ids).not.toContain("nav.up")
	})
})
