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
})
