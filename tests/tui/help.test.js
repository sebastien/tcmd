// The `?` overlay's key reference reads as two balanced columns of bar
// shorthand.

import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createAppComponent } from "../../src/js/tcmd/tui/app.js"
import { createMockFs } from "../helpers/mock-fs.js"
import { settle } from "../helpers/tui-setup.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

async function makeSetup(width = 120, height = 30) {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	const session = createSession({ fs, left, right, viewMode: "commander" })
	await load(session)
	const size = cell({ width, height })
	const help = cell(false)
	const App = createAppComponent(session, { size, help })
	const { testRender } = await import("select.tui")
	const setup = await testRender(App, { width, height })
	await setup.renderOnce()
	return { setup, session, help, size }
}

// The scrollbar renders as background-coloured cells, so it is detected from
// the captured spans (track #252527 / thumb #9a9ea3) rather than the text frame.
function hasScrollBar(setup) {
	const colors = [
		[37, 37, 39],
		[154, 158, 163],
	]
	for (const line of setup.captureSpans().lines) {
		for (const span of line.spans) {
			const bg = span.bg?.buffer
			if (bg && colors.some((color) => bg[0] === color[0] && bg[1] === color[1] && bg[2] === color[2])) return true
		}
	}
	return false
}

describe("help overlay", () => {
	test("`?` opens a two-column reference of bar shorthands", async () => {
		const { setup, help } = await makeSetup()
		try {
			help.set(true)
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Keys")
			// Uppercase section headings, bright; rows read like the bar with the
			// key padded to the right.
			expect(frame).toContain("NAVIGATION")
			expect(frame).toContain("PANES")
			expect(frame).toContain("[Cursor up")
			expect(frame).toContain("⏎]")
			expect(frame).toContain("[Help")
			// The footer sits below a rule, as a bar shorthand.
			expect(frame).toContain("[Close Esc]")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shows a scrollbar while the reference overflows", async () => {
		const short = await makeSetup(100, 14)
		try {
			short.help.set(true)
			await settle(short.setup)
			expect(hasScrollBar(short.setup)).toBe(true)
		} finally {
			short.setup.renderer.destroy()
		}
	})
})
