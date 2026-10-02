import { describe, expect, test } from "bun:test"
import { makeSetup as makeSetupTui, settle } from "../helpers/tui-setup.js"

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

const makeSetup = (width, height) => makeSetupTui(TREE, width, height)

describe("tui app", () => {
	test("renders the header, both panes and the command bar", async () => {
		const { setup, session } = await makeSetup()
		try {
			const frame = setup.captureCharFrame()
			const lines = frame.split("\n")
			expect(lines[0]).toContain("TinyCmd")
			expect(frame).toContain("tester")
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("home")
			expect(frame).toContain("etc")
			// Command bar key hints from the command registry.
			expect(frame).toContain("Open[Enter]")
			expect(frame).toContain("Switch[Tab]")
			// Summary counts.
			expect(frame).toContain("files")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("frame title shows the active path, compressed to fit", async () => {
		// Above the minimum gate, but too narrow for the full path.
		const { setup, session } = await makeSetup(70, 16)
		try {
			await session.panes.left.navigate("/home/tester")
			await setup.renderOnce()
			// Identity now lives in the frame's top border, not a header row.
			expect(setup.captureCharFrame().split("\n")[0]).toContain("TinyCmd")
			expect(setup.captureCharFrame().split("\n")[0]).toContain("/home/tester")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shows a minimum-size hint below the workspace breakpoint", async () => {
		const { setup } = await makeSetup(50, 12)
		try {
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Terminal too small")
			expect(frame).toContain("need 64x16")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("arrow keys move the cursor in the active pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			expect(session.panes.left.cursor.value).toBe(0)
			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.panes.left.cursor.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await settle(setup)
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("tab switches the active pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("\t")
			await settle(setup)
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
			await settle(setup)
			expect(session.paletteOpen.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("palette")

			setup.mockInput.typeText("switch")
			await settle(setup)
			const items = session.paletteItems.value.map((item) => item.id)
			expect(items).toEqual(["pane.toggle"])

			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.paletteOpen.value).toBe(false)
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("command palette arrows navigate, tab completes and enter runs the selection", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("p", { ctrl: true })
			await settle(setup)
			expect(session.paletteOpen.value).toBe(true)

			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.paletteIndex.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await settle(setup)
			expect(session.paletteIndex.value).toBe(0)

			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.paletteQuery.value).toBe(session.paletteItems.value[0].title)

			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.paletteOpen.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("tab bar shows the pane tabs and t/[ ]/^W manage them", async () => {
		const { setup, session } = await makeSetup()
		try {
			// The pane header (tabs + path) sits on the first row inside the frame.
			const first = setup.captureCharFrame().split("\n")[1]
			expect(first).toContain("A")
			expect(first).toContain("+")

			setup.mockInput.pressKey("t")
			await Promise.resolve()
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.panes.left.tabs.value.map((tab) => tab.label)).toEqual(["A", "C"])
			expect(session.panes.left.activeIndex.value).toBe(1)
			expect(setup.captureCharFrame().split("\n")[1]).toContain("C")

			setup.mockInput.pressKey("[")
			await settle(setup)
			expect(session.panes.left.activeIndex.value).toBe(0)
			setup.mockInput.pressKey("]")
			await settle(setup)
			expect(session.panes.left.activeIndex.value).toBe(1)

			setup.mockInput.pressKey("w", { ctrl: true })
			await settle(setup)
			expect(session.panes.left.tabs.value.length).toBe(1)
			expect(session.panes.left.activeIndex.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("scripting mode lists filesets and operations, then runs a line", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Mark notes.txt, then open scripting mode: the buffer shows as $A.
			setup.mockInput.pressArrow("down")
			setup.mockInput.pressArrow("down")
			setup.mockInput.pressKey(" ")
			await settle(setup)

			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.paletteOpen.value).toBe(true)
			expect(session.paletteMode.value).toBe("script")
			const frame = setup.captureCharFrame()
			expect(frame).toContain("script")
			expect(frame).toContain("$A")
			expect(frame).toContain("copy")

			setup.mockInput.typeText("touch fresh.txt")
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.paletteOpen.value).toBe(false)
			expect(session.notice.value.text).toContain("touched")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("scripting mode tab-completes the selected path argument", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			setup.mockInput.typeText("copy notes")
			await settle(setup)
			const titles = session.paletteItems.value.map((item) => item.title)
			expect(titles).toEqual(["copy", "notes.txt"])
			setup.mockInput.pressArrow("down")
			await settle(setup)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.paletteQuery.value).toBe("copy notes.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("stat shows a details card in the preview", async () => {
		const { setup, session } = await makeSetup()
		try {
			await session.dispatch("list.cursor", { paneId: "left", index: 0 })
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			await import("../../src/js/tcmd/core/script.js").then(({ runLine }) =>
				runLine(session, "stat tester"),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.preview.value.kind).toBe("directory")
			expect(setup.captureCharFrame()).toContain("directory")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shift-tab switches back to the previous pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			expect(session.active.value).toBe("left")
			// Shift-Tab arrives as CSI Z on the wire.
			setup.mockInput.pressKey("\x1B[Z")
			await settle(setup)
			expect(session.active.value).toBe("right")
			setup.mockInput.pressKey("\x1B[Z")
			await settle(setup)
			expect(session.active.value).toBe("left")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clicking a pane row activates that pane", async () => {
		const { setup, session } = await makeSetup(90, 18)
		try {
			expect(session.active.value).toBe("left")
			// First entry row of the right pane (frame border, merged header).
			await setup.mockMouse.click(60, 2)
			await settle(setup)
			expect(session.active.value).toBe("right")
			expect(session.panes.right.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clicking the body of a pane activates it", async () => {
		const { setup, session } = await makeSetup(90, 18)
		try {
			expect(session.active.value).toBe("left")
			// Blank area inside the right pane (past its last entry).
			await setup.mockMouse.click(55, 12)
			await settle(setup)
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("v toggles the preview column", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("v")
			await settle(setup)
			expect(session.showPreview.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("slash filters the pane, enter keeps it and escape clears", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("/")
			await settle(setup)
			expect(session.filtering.value).toBe("left")

			await setup.mockInput.typeText("tiny")
			await settle(setup)
			expect(session.panes.left.filter.value).toBe("tiny")
			expect(session.panes.left.entries.value.map((e) => e.name)).toEqual(["tiny.txt"])
			expect(session.panes.left.cursor.value).toBe(0)
			const filtered = setup.captureCharFrame()
			expect(filtered).toContain("/ tiny")
			expect(filtered).toContain("tiny.txt")
			expect(filtered).not.toContain("notes.txt")

			setup.mockInput.pressEnter()
			await settle(setup)
			expect(session.filtering.value).toBeNull()
			expect(session.panes.left.filter.value).toBe("tiny")

			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await setup.renderOnce()
			expect(session.panes.left.filter.value).toBe("")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("filter shows a no-match alert when nothing matches", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("/")
			await settle(setup)
			await setup.mockInput.typeText("zzz")
			await settle(setup)
			expect(session.panes.left.entries.value.length).toBe(0)
			expect(setup.captureCharFrame()).toContain("no match")
		} finally {
			setup.renderer.destroy()
		}
	})
})
