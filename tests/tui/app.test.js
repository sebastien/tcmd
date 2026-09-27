import { describe, expect, test } from "bun:test"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createAppComponent } from "../../src/js/tcmd/tui/app.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\nthird line\n", size: 26 },
		{ name: "tiny.txt", text: "tiny", size: 4 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

async function makeSetup(width = 100, height = 20) {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	const session = createSession({ fs, left, right })
	await load(session)
	const App = createAppComponent(session)
	const { testRender } = await import("select.tui")
	const setup = await testRender(App, { width, height })
	await setup.renderOnce()
	return { setup, session }
}

describe("tui app", () => {
	test("renders both panes with entries, breadcrumbs and toolbar", async () => {
		const { setup, session } = await makeSetup()
		try {
			const frame = setup.captureCharFrame()
			expect(frame).toContain("tester")
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("home")
			expect(frame).toContain("etc")
			// Toolbar labels from the command registry.
			expect(frame).toContain("Switch[Tab]")
			// Summary counts.
			expect(frame).toContain("files")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("arrow keys move the cursor in the active pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			expect(session.panes.left.cursor.value).toBe(0)
			setup.mockInput.pressArrow("down")
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.panes.left.cursor.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("tab switches the active pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("\t")
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("enter opens the directory under the cursor", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.panes.left.path.value).toBe("/home/tester")
			expect(setup.captureCharFrame()).toContain("tester /")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("preview shows text file content when toggled on", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Cursor on notes.txt (index 1 after dirs).
			setup.mockInput.pressArrow("down")
			await Promise.resolve()
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.preview.value?.kind).toBe("text")
			const frame = setup.captureCharFrame()
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("hello")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("command palette opens, filters and runs commands", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("p", { ctrl: true })
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.paletteOpen.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("palette")

			setup.mockInput.typeText("switch")
			await Promise.resolve()
			await setup.renderOnce()
			const items = session.paletteItems.value.map((item) => item.id)
			expect(items).toEqual(["pane.toggle"])

			setup.mockInput.pressKey("\r")
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.paletteOpen.value).toBe(false)
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("v toggles the preview column", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("v")
			await Promise.resolve()
			await setup.renderOnce()
			expect(session.showPreview.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})
})
