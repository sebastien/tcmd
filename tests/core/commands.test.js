import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession, load } from "../../src/js/tcmd/core/session.js"
import { getCommand, getCommandBarItems, getCommands } from "../../src/js/tcmd/core/commands.js"
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

	test("nav.jumpDown/jumpUp move the cursor by a few lines, clamped", async () => {
		const fs = createMockFs({
			"/": [{ name: "many", isDir: true }],
			"/many": Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.txt` })),
		})
		const session = createSession({
			fs,
			left: createPane({ fs, path: "/many" }),
			right: createPane({ fs, path: "/" }),
		})
		await load(session)
		session.dispatch("nav.jumpDown")
		expect(session.panes.left.cursor.value).toBe(5)
		session.dispatch("nav.jumpDown")
		expect(session.panes.left.cursor.value).toBe(10)
		session.dispatch("nav.jumpDown") // clamps at the last entry
		expect(session.panes.left.cursor.value).toBe(11)
		session.dispatch("nav.jumpUp")
		expect(session.panes.left.cursor.value).toBe(6)
		session.dispatch("nav.jumpUp") // clamps at the first entry
		session.dispatch("nav.jumpUp")
		session.dispatch("nav.jumpUp")
		expect(session.panes.left.cursor.value).toBe(0)
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

	test("pane.back and pane.forward walk the pane history", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.back") // nothing recorded yet
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")

		session.dispatch("pane.enter") // /home -> /home/tester
		await new Promise((resolve) => setTimeout(resolve, 0))
		session.dispatch("pane.up") // /home/tester -> /home
		await new Promise((resolve) => setTimeout(resolve, 0))

		session.dispatch("pane.back")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		session.dispatch("pane.forward")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
	})

	test("list.mark toggles the mark under the cursor", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("list.mark")
		expect(session.panes.left.marked.value.size).toBe(1)
	})

	test("list.cursor activates the clicked pane", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("list.cursor", { paneId: "right", index: 0 })
		expect(session.active.value).toBe("right")
		expect(session.panes.right.cursor.value).toBe(0)
	})

	test("pane.activate switches the active pane and ignores unknown ids", () => {
		const session = makeSession()
		session.dispatch("pane.activate", { paneId: "right" })
		expect(session.active.value).toBe("right")
		session.dispatch("pane.activate", { paneId: "middle" })
		expect(session.active.value).toBe("right")
	})

	test("view.togglePreview flips showPreview", async () => {
		const session = makeSession()
		session.dispatch("view.togglePreview")
		expect(session.showPreview.value).toBe(false)
	})

	test("unknown commands are ignored", () => {
		const session = makeSession()
		expect(session.dispatch("nope")).toBeNull()
	})

	test("the command bar marks the Open action as primary", () => {
		const items = getCommandBarItems(false, "ui", null)
		const open = items.find((item) => item.id === "pane.enter")
		expect(open.primary).toBe(true)
		const others = items.filter((item) => item.id && item.id !== "pane.enter")
		expect(others.every((item) => item.primary !== true)).toBe(true)
	})

	test("failures land on the active pane error", async () => {
		const session = makeSession()
		session.active.set("right")
		const command = getCommand("pane.reload")
		const original = command.run
		command.run = () => {
			throw new Error("boom")
		}
		try {
			await session.dispatch("pane.reload")
			expect(session.panes.right.error.value).toBe("boom")
			expect(session.panes.left.error.value).toBeNull()
		} finally {
			command.run = original
		}
	})
})
