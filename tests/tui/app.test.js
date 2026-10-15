import { describe, expect, test } from "bun:test"
import { argvFor } from "../../src/js/tcmd/core/panel.js"
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

const makeSetup = (width, height, options) => makeSetupTui(TREE, width, height, options)

describe("tui app", () => {
	test("renders the header, both panes and the command bar", async () => {
		const { setup, session } = await makeSetup()
		try {
			const frame = setup.captureCharFrame()
			const lines = frame.split("\n")
			// The identity bar names the app; the panes tile below it.
			expect(lines[0]).toContain("TinyCmd")
			expect(lines[1]).toStartWith("┌")
			expect(frame).toContain("tester")
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("home")
			expect(frame).toContain("etc")
			// Command bar key hints from the command registry.
			expect(frame).toContain("[Open ⏎]")
			expect(frame).toContain("[Switch ⇥]")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the entry detail renders under the listing", async () => {
		const { setup, session } = await makeSetup()
		try {
			// The cursor starts on `notes.txt` (index 1 after `tester/`).
			session.panes.left.cursor.set(1)
			await settle(setup)
			const detail = setup.captureCharFrame()
			const detailLine = detail.split("\n").find((line) => line.includes("file · 26B"))
			expect(detailLine).toBeDefined()
			expect(detail).toContain("rw-r--r--")
			// The summary counts row is gone from the pane footer.
			expect(detail).not.toContain(" dirs,")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("marks show a selected count in the entry detail", async () => {
		const { setup } = await makeSetup()
		try {
			// Space marks the cursor entry; two marks surface the count.
			setup.mockInput.pressKey(" ")
			await settle(setup)
			setup.mockInput.pressArrow("down")
			await settle(setup)
			setup.mockInput.pressKey(" ")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("2 selected")
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
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
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
			expect(setup.captureCharFrame()).toContain("/home/tester")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("navigation leaves the previous pane frame unchanged until the listing is ready", async () => {
		const { setup, session } = await makeSetup()
		try {
			const pane = session.panes.left
			pane.cursor.set(1)
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 0))
			await settle(setup)
			const before = setup.captureCharFrame()
			const readDir = session.fs.readDir
			let finish
			session.fs.readDir = (path) => path === "/home/tester"
				? new Promise((resolve) => { finish = resolve })
				: readDir(path)
			const navigation = pane.navigate("/home/tester")
			await settle(setup)
			expect(setup.captureCharFrame()).toBe(before)
			finish(await readDir("/home/tester"))
			await navigation
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("/home/tester")
			expect(setup.captureCharFrame()).not.toBe(before)
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

	test("the panel opens, filters and runs an operation", async () => {
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("Command ·")

			await setup.mockInput.typeText("touch")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.id)).toEqual(["op:touch"])

			setup.mockInput.pressKey("\r")
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(session.panelOpen.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the panel arrows navigate the entries, Tab walks the focus ring", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)

			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.panelOpIndex.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await settle(setup)
			expect(session.panelOpIndex.value).toBe(0)

			// Tab walks the focus ring: the argument headers (NAME then PATH),
			// then back to the filter.
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelRowIndex.value).toBe(0)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelRowIndex.value).toBe(1)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("ops")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the header shows the pane path and b/g manage bookmarks", async () => {
		const { setup, session } = await makeSetup()
		try {
			// The pane header (the path breadcrumb) sits below the pane's top
			// border — no role label.
			const first = setup.captureCharFrame().split("\n")[2]
			expect(first).toContain("/home")
			expect(first).not.toContain("SRC")
			expect(first).not.toContain("DST")
			expect(first).not.toContain("+")

			// b records the cursor entry: the name prompt opens, pre-filled
			// with the basename.
			setup.mockInput.pressArrow("down")
			await settle(setup)
			setup.mockInput.pressKey("b")
			await settle(setup)
			expect(session.bookmarkOpen.value).toBe(true)
			expect(session.bookmarkMode.value).toBe("name")
			expect(session.bookmarkQuery.value).toBe("notes.txt")
			expect(session.bookmarkTarget.value).toEqual({ path: "/home/notes.txt", isDir: false })
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.bookmarks.entries.value["notes.txt"].path).toBe("/home/notes.txt")
			expect(session.bookmarks.entries.value["notes.txt"].isDir).toBe(false)

			// g opens the fuzzy picker and jumping selects+previews the file.
			setup.mockInput.pressKey("g")
			await settle(setup)
			expect(session.bookmarkMode.value).toBe("list")
			expect(session.bookmarkItems.value.map((row) => row.name)).toContain("notes.txt")
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.bookmarkOpen.value).toBe(false)
			expect(session.panes.left.currentEntry().path).toBe("/home/notes.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`!` lands on the shell operation with its CMD field focused", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("!")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("run")
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelTextual.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("Command · run")

			// The raw field takes the rest of the line verbatim, so fileset
			// tokens still reach `expandArg` when the operation runs.
			await setup.mockInput.typeText("stat $A")
			await settle(setup)
			expect(session.panelValue.value).toBe("stat $A")
			expect(argvFor(session.panelDraft.value)).toEqual(["stat $A"])
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`:` opens the command panel", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Command ·")
			expect(frame).toContain("copy FROM TO")
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
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
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
		const { setup, session } = await makeSetup(90, 18, { viewMode: "commander" })
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
		const { setup, session } = await makeSetup(90, 18, { viewMode: "commander" })
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

	test("clicking the identity bar's mode word toggles the view", async () => {
		const { setup, session } = await makeSetup(120, 30, { viewMode: "commander" })
		try {
			expect(session.viewMode.value).toBe("commander")
			// The mode word rides the right-hand end of the identity bar (row 0).
			const row0 = setup.captureCharFrame().split("\n")[0]
			await setup.mockMouse.click(row0.indexOf("commander") + 1, 0)
			await settle(setup)
			expect(session.viewMode.value).toBe("explorer")
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

	test("enter on a file opens the fullscreen viewer it cannot edit", async () => {
		// The helper's session uses the null host (`canEdit: false`), so Enter
		// on a text file opens the viewer overlay, even on a wide terminal.
		const { setup, session } = await makeSetup()
		try {
			session.panes.left.cursor.set(1)
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.viewerOpen.value).toBe(true)
			// ⇧V is swallowed by the overlay: it neither closes nor maximizes.
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.viewerOpen.value).toBe(true)
			expect(session.previewFull.value).toBe(false)
			// Esc closes the overlay and returns to the workspace.
			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await setup.renderOnce()
			expect(session.viewerOpen.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shift-v maximizes the inspector over the pane row", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Both panes are on screen first (`etc` is the destination's).
			expect(setup.captureCharFrame()).toContain("etc")
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.previewFull.value).toBe(true)
			const frame = setup.captureCharFrame()
			// The identity and command bars stay; the pane row is the preview.
			expect(frame.split("\n")[0]).toContain("TinyCmd")
			expect(frame).toContain("[Open ⏎]")
			expect(frame).toContain("notes.txt")
			// The destination pane's listing is covered by the preview.
			expect(frame).not.toContain("etc")
			// Shift-V again restores the panes untouched.
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.previewFull.value).toBe(false)
			expect(setup.captureCharFrame()).toContain("etc")
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

	test("typing filters re-anchor the cursor through setFilter", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Park the cursor on the last entry, then filter to the first one.
			session.panes.left.cursor.set(2)
			setup.mockInput.pressKey("/")
			await settle(setup)
			await setup.mockInput.typeText("tester")
			await settle(setup)
			expect(session.panes.left.filter.value).toBe("tester")
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})
})
