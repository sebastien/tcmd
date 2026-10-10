// Golden frames: the TUI at fixed sizes, so layout, alignment, truncation and
// the responsive breakpoints become a regression contract rather than a
// "looks right". Frames are asserted on stable landmarks (borders, pane
// separators, key labels), not pixel-exact snapshots, so harmless restyling
// does not churn the test while real regressions do.

import { describe, expect, test } from "bun:test"
import { makeSetup as makeSetupTui, settle } from "../helpers/tui-setup.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "documents", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\nthird line\n", size: 26 },
		{ name: "tiny.txt", text: "tiny", size: 4 },
		{ name: "archive.tar.gz", text: "x", size: 10485760 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/empty": [],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

const makeSetup = (width, height) => makeSetupTui(TREE, width, height)

// A frame is aligned when every rendered line has the same display width.
function widths(frame) {
	return frame.split("\n").map((line) => line.length)
}

describe("golden frames", () => {
	test("120x30: framed workspace, two panes, inline inspector, status bar", async () => {
		const { setup } = await makeSetup(120, 30)
		try {
			const frame = setup.captureCharFrame()
			// A single rounded frame with the identity in its title.
			expect(frame.split("\n")[0]).toStartWith("╭")
			expect(frame.split("\n")[0]).toContain("TinyCmd")
			expect(frame.split("\n")[0]).toContain("/home")
			// Each pane is a single-line box (square corners) tiled inside the
			// frame, with a header rule under the SRC/DST header row.
			expect(frame).toContain("┌")
			expect(frame).toContain("└")
			expect(frame).toContain("│")
			// The pane headers carry the source/destination labels.
			expect(frame).toContain("SRC")
			expect(frame).toContain("DST")
			// The inline inspector holds the first entry (a directory) as a card.
			expect(frame).toContain("documents/")
			expect(frame).toContain("directory: documents/")
			expect(frame).toContain("[O]pen [E]dit")
			// The status bar shows hints on the left, inside the frame.
			const bar = frame.split("\n").find((line) => line.includes("Open") && line.includes("Enter"))
			expect(bar).toBeDefined()
			expect(bar).toContain("")
			expect(bar).toContain("")
			// No scrollbar chrome: the content is tracked by keepVisible.
			expect(frame).not.toContain("█")
			for (const width of widths(frame)) {
				if (width > 0) expect(width).toBe(120)
			}
		} finally {
			setup.renderer.destroy()
		}
	})

	test("70x16: compact status bar, inline inspector collapses", async () => {
		const { setup } = await makeSetup(70, 16)
		try {
			const frame = setup.captureCharFrame()
			expect(frame.split("\n")[0]).toContain("TinyCmd")
			// Two panes remain; the inspector is gone (width < 100).
			expect(frame).toContain("/home")
			expect(frame).not.toContain("[O]pen [E]dit")
			// Long names no longer collide with the size column.
			expect(frame).toContain("archive.tar.gz")
			expect(frame).toContain("10.0M")
			for (const width of widths(frame)) {
				if (width > 0) expect(width).toBe(70)
			}
		} finally {
			setup.renderer.destroy()
		}
	})

	test("50x12: the minimum-size gate replaces the workspace", async () => {
		const { setup } = await makeSetup(50, 12)
		try {
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Terminal too small")
			expect(frame).toContain("need 64x16, have 50x12")
			// No panes leak through the gate.
			expect(frame).not.toContain("notes.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("empty directory shows a designed empty state", async () => {
		const { setup, session } = await makeSetup(100, 20)
		try {
			await session.panes.left.navigate("/empty")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("(empty)")
			expect(frame).toContain("0 dirs, 0 files")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("palette is centered with a selected marker and its own hints", async () => {
		const { setup } = await makeSetup(100, 20)
		try {
			setup.mockInput.pressKey("p", { ctrl: true })
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("palette")
			expect(frame).toContain("↑↓ move")
			expect(frame).toContain("run")
			// The command bar underneath still advertises its context.
			const bar = frame.split("\n").find((line) => line.includes("Navigate"))
			expect(bar).toBeDefined()
			// Selected rows carry a marker, not just colour.
			expect(frame).toMatch(/│>\s/)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("help overlay lists the bindings by category", async () => {
		const { setup } = await makeSetup(100, 24)
		try {
			setup.mockInput.pressKey("?")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Keys")
			expect(frame).toContain("Navigation")
			expect(frame).toContain("Open")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("command panel lists operations and bound arguments", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey("m")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain(" Command · copy ")
			expect(frame).toContain("copy FROM TO")
			expect(frame).toContain("FROM")
			expect(frame).toContain("SRC")
			// An item row shows its basename in full and its parent directory.
			expect(frame).toContain("[x] documents")
			expect(frame).toContain("/home")
			expect(frame).toContain("TO")
			// Each operation row advertises the arguments it takes.
			expect(frame).toContain("[NAME] [PATH]")
			// The preview maps the draft to a full assembled command line.
			expect(frame).toContain("runs")
			expect(frame).toContain("copy /home/documents /")
			// The filter prompt is the header row.
			expect(frame).toContain("›")
			// The panel keys are advertised in its own footer.
			expect(frame).toContain("filter")
			// The command bar underneath switches to the panel hints.
			expect(frame).toContain("Toggle")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("typing in the panel filters operations and Tab cycles to the arguments", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("edit")
			await settle(setup)
			// The matching command takes the cursor; the list narrows to it.
			expect(session.panelOperation.value.name).toBe("edit")
			expect(session.panelQuery.value).toBe("edit")
			const frame = setup.captureCharFrame()
			expect(frame).toContain(" Command · edit ")
			expect(frame).not.toContain("bookmark [NAME]")
			expect(frame).toContain("runs")
			expect(frame).toContain("edit /home/documents")
			// Tab walks to the first argument and wraps back to the command.
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("args")
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("ops")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("toggling an argument item is transient and flips the marker", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey("m")
			await settle(setup)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			setup.mockInput.pressKey(" ")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("[ ] documents")
			expect(frame).toContain("SRC · 0 selected")
			// The real pane marks are untouched.
			expect(session.panes.left.marked.value.size).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("running the default copy from the panel closes it and reports", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey("m")
			await settle(setup)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(session.panelOpen.value).toBe(false)
			expect(session.notice.value?.text).toContain("copied")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("a resize collapses the inline inspector and compacts the status bar", async () => {
		const { setup, size } = await makeSetup(120, 30)
		try {
			await setup.renderOnce()
			expect(setup.captureCharFrame()).toContain("[O]pen [E]dit")

			// Shrink the viewport: the inline inspector collapses and the bar
			// drops to its essential hints.
			size.set({ width: 70, height: 20 })
			await settle(setup)
			const narrow = setup.captureCharFrame()
			expect(narrow).not.toContain("[O]pen [E]dit")
			expect(narrow).toContain("Switch")
			expect(narrow).toContain("Tab")
			// The essential bookmark hint stays in the compact bar.
			expect(narrow).toContain("Bookmarks")

			// Grow again: the inspector returns.
			size.set({ width: 120, height: 30 })
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("[O]pen [E]dit")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the listing fills the pane: chrome takes ten rows, not one more", async () => {
		// A tall listing makes the visible row count readable off the frame:
		// the fixed chrome (frame border, pane border, header, rule, detail,
		// summary, command bar) consumes exactly ten rows, which is what the
		// windowed viewport (`frame.paneListHeight`) is derived from.
		const tall = {
			"/": [{ name: "home", isDir: true }],
			"/home": Array.from({ length: 40 }, (_, i) => ({
				name: `f${String(i).padStart(2, "0")}.txt`,
				text: "x",
				size: i,
			})),
		}
		// 120x40 → 30 listing rows: the last visible row is f29, f30 is not.
		const { setup: big } = await makeSetupTui(tall, 120, 40)
		try {
			await settle(big)
			const frame = big.captureCharFrame()
			expect(frame).toContain("f29.txt")
			expect(frame).not.toContain("f30.txt")
		} finally {
			big.renderer.destroy()
		}

		// 120x30 → 20 listing rows: f19 in, f20 out.
		const { setup: small } = await makeSetupTui(tall, 120, 30)
		try {
			await settle(small)
			const frame = small.captureCharFrame()
			expect(frame).toContain("f19.txt")
			expect(frame).not.toContain("f20.txt")
		} finally {
			small.renderer.destroy()
		}
	})
})
