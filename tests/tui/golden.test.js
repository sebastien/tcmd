// Golden frames: the TUI at fixed sizes, so layout, alignment, truncation and
// the responsive breakpoints become a regression contract rather than a
// "looks right". Frames are asserted on stable landmarks (borders, pane
// separators, key labels), not pixel-exact snapshots, so harmless restyling
// does not churn the test while real regressions do.

import { describe, expect, test } from "bun:test"
import { VERSION } from "../../src/js/tcmd/components/Frame.js"
import { makeSetup as makeSetupTui, settle } from "../helpers/tui-setup.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "documents", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\nthird line\n", size: 26 },
		{ name: "notes-link", isSymlink: true, target: "notes.txt" },
		{ name: "tiny.txt", text: "tiny", size: 4 },
		{ name: "archive.tar.gz", text: "x", size: 10485760 },
	],
	"/home/documents": [{ name: "report.txt", text: "draft\n", size: 6 }],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/empty": [],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

const makeSetup = (width, height, options) => makeSetupTui(TREE, width, height, options)

// A frame is aligned when every rendered line has the same display width.
function widths(frame) {
	return frame.split("\n").map((line) => line.length)
}

describe("golden frames", () => {
	test("120x30: two panes, inline inspector, wrapped status bar", async () => {
		const { setup } = await makeSetup(120, 30, { viewMode: "commander" })
		try {
			const frame = setup.captureCharFrame()
			// The identity bar names the app; the pane boxes tile below it.
			const lines = frame.split("\n")
			expect(lines[0]).toContain("TinyCmd")
			// The view mode and version ride the right-hand end of the bar.
			expect(lines[0].trimEnd()).toEndWith(`commander · ${VERSION}`)
			const lineWidths = widths(frame).filter((w) => w > 0)
			expect(Math.max(...lineWidths)).toBe(120)
			for (const width of lineWidths) expect(width).toBeLessThanOrEqual(120)
			// Each pane is a single-line box (square corners) tiled inside the
			// workspace, with a header rule under the breadcrumb header row.
			expect(lines[1]).toStartWith("┌")
			expect(frame).toContain("└")
			expect(frame).toContain("│")
			// The pane headers lead with the path — no role label.
			expect(frame).not.toContain("SRC")
			expect(frame).not.toContain("DST")
			// The inline inspector previews the first entry (a directory) as a
			// pane: its own breadcrumb header over its listing, not a card.
			expect(frame).toContain("documents/")
			expect(frame).toContain("╭─documents/  <DIR>")
			expect(frame).toContain("/home/documents")
			expect(frame).toContain("report.txt")
			expect(frame).not.toContain("directory: documents/")
			// The inspector no longer foots with the shortcut line.
			expect(frame).not.toContain("[Open O] [Edit E]")
			// The status bar shows bracket shorthands on the left, inside the
			// frame — no Powerline pill caps.
			const bar = frame.split("\n").find((line) => line.includes("[Open ⏎]"))
			expect(bar).toBeDefined()
			expect(bar).toContain("[Open ⏎]")
			// The pane headers keep a leading space before the path.
			expect(frame).toContain(" /home")
			// A symlink row prints its target, `ls -l` style.
			expect(frame).toContain("notes-link -> notes.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("70x16: wrapped status bar, inline inspector collapses", async () => {
		const { setup } = await makeSetup(70, 16)
		try {
			const frame = setup.captureCharFrame()
			// Two panes remain; the inspector is gone (width < 100).
			expect(frame).toContain("/home")
			expect(frame).not.toContain(" [Open O] [Edit E]")
			// Long names no longer collide with the size column.
			expect(frame).toContain("archive.tar.gz")
			expect(frame).toContain("10.0M")
			for (const width of widths(frame)) {
				expect(width).toBeLessThanOrEqual(70)
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

	// Box widths on a top-border line, in column order. The explorer's middle
	// column is the one that grows, so the geometry is the regression check.
	function columnWidths(frame) {
		const border = frame.split("\n")[1]
		return [...border.matchAll(/[┌╭]([^┌╭╮┐╯╰]*)[┐╮]/g)].map((match) => match[1].length)
	}

	test("opens in the three-column explorer by default", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			expect(session.viewMode.value).toBe("explorer")
			const frame = setup.captureCharFrame()
			expect(frame.split("\n")[0].trimEnd()).toEndWith(`explorer · ${VERSION}`)
			// Parent mirror, current directory, directory preview.
			expect(columnWidths(frame).length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`t` toggles the three-column explorer: parent, wider current, preview", async () => {
		const { setup, session } = await makeSetup(120, 30, { viewMode: "commander" })
		try {
			// Commander: source and destination share the row evenly (the
			// layout rounds to the nearest column, so "evenly" is ±1).
			const commander = columnWidths(setup.captureCharFrame())
			expect(commander.length).toBe(3)
			expect(Math.abs(commander[0] - commander[1])).toBeLessThanOrEqual(1)

			setup.mockInput.pressKey("t")
			await settle(setup)
			expect(session.viewMode.value).toBe("explorer")
			expect(session.panes.parent.path.value).toBe("/")

			const explorer = setup.captureCharFrame()
			expect(explorer.split("\n")[0].trimEnd()).toEndWith(`explorer · ${VERSION}`)
			const widths = columnWidths(explorer)
			// Parent mirror, current directory, directory preview.
			expect(widths.length).toBe(3)
			expect(widths[1]).toBeGreaterThan(widths[0])
			expect(widths[1]).toBeGreaterThan(widths[2])
			// The two mirrors stay even beside the middle column.
			expect(Math.abs(widths[0] - widths[2])).toBeLessThanOrEqual(2)
			// Each column carries its own path header, and the third one is
			// the previewed directory's listing rather than a card.
			expect(explorer).toContain("/home/documents")
			expect(explorer).toContain("report.txt")
			expect(explorer).not.toContain("directory: documents/")

			setup.mockInput.pressKey("t")
			await settle(setup)
			expect(session.viewMode.value).toBe("commander")
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
			expect(frame).toContain("NAVIGATION")
			expect(frame).toContain("PANES")
			expect(frame).toContain("[Open")
			expect(frame).toContain("⏎]")
			// The footer sits below a rule, as a bar shorthand.
			expect(frame).toContain("[Close Esc]")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("command panel groups name-only operations and shows bound arguments with Run", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			const frame = setup.captureCharFrame()
			// The entry list opens on `bookmark`, first in the White group.
			expect(frame).toContain(" Command · bookmark ")
			expect(frame).toContain("White")
			expect(frame).toContain("Amber")
			const groupSpans = setup.captureSpans().lines
				.flatMap((line) => line.spans)
				.filter((span) => ["White", "Amber"].includes(span.text))
			expect(groupSpans.map((span) => span.attributes)).toEqual([1, 1])
			expect(frame).toContain("copy")
			expect(frame).not.toContain("copy FROM TO")
			// bookmark's PATH is a single path: it renders as a pre-filled,
			// read-only path, not a list.
			expect(frame).toContain("/home/documents")
			expect(frame).toContain("[Run]")
			const lines = frame.split("\n")
			const pathLine = lines.findIndex((line) => line.includes("/home/documents"))
			const runLine = lines.findIndex((line) => line.includes("[Run]"))
			expect(runLine).toBeGreaterThanOrEqual(pathLine + 2)
			// A vertical rule divides the command list from the argument pane:
			// the rows carry a "│" between the two panes.
			expect(frame).toMatch(/bookmark[^\n]*│/)
			// No internal TinyCmd actions appear in the list.
			expect(frame).not.toContain("Open file")
			// The right pane does not echo a resolved command summary.
				expect(frame).not.toContain("bookmark /home/documents")
			// The filter prompt is the colon in the left pane.
			expect(frame).toContain(":")
			// The panel keys are advertised in its own footer.
			expect(frame).toContain("type to filter")
			// The command bar underneath switches to the panel hints.
			expect(frame).toContain("Toggle")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the panel filters name-only CLI operations", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("open")
			await settle(setup)
			// Only the CLI operation matches; the internal actions are gone.
			expect(session.panelItems.value.map((item) => item.id)).toEqual(["group:white", "op:open"])
			const frame = setup.captureCharFrame()
			expect(frame).toContain(" Command · open ")
			expect(frame).not.toContain("open PATH...")
			expect(frame).not.toContain("Open file")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the command list scrolls to the selected command while Run follows its arguments", async () => {
		const { setup, session } = await makeSetup(120, 18)
		try {
			session.dispatch("panel.open")
			await settle(setup)
			const last = session.panelFiltered.value.length - 1
			session.dispatch("panel.setOp", { index: last })
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 30))
			const lines = setup.captureCharFrame().split("\n")
			const eraseLine = lines.findIndex((line) => line.includes(">  erase"))
			expect(eraseLine).toBeGreaterThanOrEqual(0)
			expect(lines.some((line) => line.includes("[Run]"))).toBe(true)
			// The final risk group is in view after the list scrolls, while the
			// arguments and Run action remain available in the right pane.
			expect(lines.some((line) => line.includes("Red"))).toBe(true)
			expect(lines.some((line) => line.includes("White"))).toBe(false)
			expect(session.panelOpIndex.value).toBe(last)
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
			expect(session.panelEntry.value.name).toBe("edit")
			expect(session.panelQuery.value).toBe("edit")
			const frame = setup.captureCharFrame()
			expect(frame).toContain(" Command · edit ")
			expect(frame).not.toContain("bookmark [NAME]")
			// No resolved command summary is shown; the arguments are followed by Run.
			expect(frame).toContain("[Run]")
			expect(frame).not.toContain("edit /home/documents")
			// Tab walks the ring: PATH, Run, then back to the filter.
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

	test("toggling an argument item is transient and flips the marker", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			// Mark two paths so FROM is a list (a single path is read-only).
			session.panes.left.cursor.set(0)
			session.panes.left.toggleMark()
			session.panes.left.cursor.set(1)
			session.panes.left.toggleMark()
			setup.mockInput.pressKey(":")
			await settle(setup)
			// Filter to `copy` so its FROM selection owns the argument rows.
			await setup.mockInput.typeText("copy")
			await settle(setup)
			// Tab to the FROM header, then toggle its whole selection off.
			setup.mockInput.pressKey("\t")
			await settle(setup)
			setup.mockInput.pressKey(" ")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("[ ] documents")
			expect(frame).toContain("SRC · 0 selected")
			// The real pane marks are untouched.
			expect(session.panes.left.marked.value.size).toBe(2)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("running the default copy from the panel closes it and reports", async () => {
		const { setup, session } = await makeSetup(120, 30, { viewMode: "commander" })
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			// The list opens on `bookmark` (the first White operation); filter to
			// the runnable `copy` draft.
			await setup.mockInput.typeText("copy")
			await settle(setup)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(session.panelOpen.value).toBe(false)
			expect(session.notice.value?.text).toContain("copied")
			await new Promise((resolve) => setTimeout(resolve, 2600))
			await settle(setup)
			expect(session.notice.value).toBeNull()
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`!` lands on the shell operation with its CMD field focused", async () => {
		const { setup, session } = await makeSetup(120, 30)
		try {
			setup.mockInput.pressKey("!")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("run")
			// The raw CMD field owns the keyboard, so typing goes straight in;
			// the filter stays empty so the full list keeps its ordering.
			expect(session.panelQuery.value).toBe("")
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelTextual.value).toBe(true)
			await setup.mockInput.typeText("echo hi")
			await settle(setup)
			expect(session.panelCommand.value).toBe("run 'echo hi'")
			expect(session.panelRunnable.value).toBe(true)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("a resize collapses the inline inspector and compacts the status bar", async () => {
		const { setup, size } = await makeSetup(120, 30)
		try {
			await setup.renderOnce()
			// The inline inspector previews `documents/` as a directory column:
			// its listing (`report.txt`) shows only while the inspector is inline.
			expect(setup.captureCharFrame()).toContain("report.txt")

			// Shrink the viewport: the inline inspector collapses and the bar
			// wraps its shorthands onto more rows.
			size.set({ width: 70, height: 20 })
			await settle(setup)
			const narrow = setup.captureCharFrame()
			expect(narrow).not.toContain("report.txt")
			expect(narrow).toContain("[Switch ⇥]")
			// The bookmark hint stays visible; the bar wraps instead of trimming.
			expect(narrow).toContain("Bookmarks")

			// Grow again: the inspector returns.
			size.set({ width: 120, height: 30 })
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("report.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the listing fills the pane: chrome takes nine rows, not one more", async () => {
		// A tall listing makes the visible row count readable off the frame:
		// the fixed chrome (identity bar, pane border, header, rule, detail,
		// command bar) consumes seven rows plus the wrapped bar, which is
		// what the windowed viewport (`frame.paneListHeight`) is derived
		// from.
		const tall = {
			"/": [{ name: "home", isDir: true }],
			"/home": Array.from({ length: 40 }, (_, i) => ({
				name: `f${String(i).padStart(2, "0")}.txt`,
				text: "x",
				size: i,
			})),
		}
		// 120x40 → 31 listing rows (seven chrome rows + the two-row wrapped
		// bar): the last visible row is f30, f31 is not.
		const { setup: big } = await makeSetupTui(tall, 120, 40)
		try {
			await settle(big)
			const frame = big.captureCharFrame()
			expect(frame).toContain("f30.txt")
			expect(frame).not.toContain("f31.txt")
		} finally {
			big.renderer.destroy()
		}

		// 120x30 → 21 listing rows: f20 in, f21 out.
		const { setup: small } = await makeSetupTui(tall, 120, 30)
		try {
			await settle(small)
			const frame = small.captureCharFrame()
			expect(frame).toContain("f20.txt")
			expect(frame).not.toContain("f21.txt")
		} finally {
			small.renderer.destroy()
		}
	})

	test("explorer mirror crumbs fit their narrower column", async () => {
		// The explorer's parent mirror is narrower than an even split (the
		// current column grows), so an even `width / 2` breadcrumb budget used
		// to overflow it and the renderer mangled every segment mid-name.
		const deep = "/home/sebastien/Workspace/Perso/tcmd"
		const tree = {
			"/": [{ name: "home", isDir: true }],
			"/home": [{ name: "sebastien", isDir: true }],
			"/home/sebastien": [{ name: "Workspace", isDir: true }],
			"/home/sebastien/Workspace": [{ name: "Perso", isDir: true }],
			"/home/sebastien/Workspace/Perso": [{ name: "tcmd", isDir: true }],
			[deep]: [
				{ name: ".git", isDir: true },
				{ name: "README.md", text: "x", size: 1 },
			],
			[deep + "/.git"]: [{ name: "HEAD", text: "x", size: 1 }],
		}
		const { setup, session } = await makeSetupTui(tree, 90, 24)
		try {
			await session.panes.left.navigate(deep + "/.git")
			await settle(setup)
			// The first column is the parent mirror (the current pane's parent).
			const parentColumn = setup.captureCharFrame().split("\n")[2].split("││")[0]
			expect(parentColumn).toContain("/h/s/Workspace/Perso/tcmd")
			expect(parentColumn).not.toContain("sebastie")
		} finally {
			setup.renderer.destroy()
		}
	})
})
