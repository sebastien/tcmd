// The `?` overlay's key reference reads as two balanced columns of bar
// shorthand.

import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createAppComponent } from "../../src/js/tcmd/tui/app.js"
import { tuiTheme } from "../../src/js/tcmd/tui/theme.js"
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

// The scrollbar renders as a thumb over a transparent track, so it is detected
// from the captured spans (the theme's night-blue thumb) rather than the text
// frame.
function rgb(hex) {
	return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
}
const SCROLLBAR_COLORS = [tuiTheme.scrollbarThumbBg].filter(Boolean).map(rgb)

function hasScrollBar(setup) {
	for (const line of setup.captureSpans().lines) {
		for (const span of line.spans) {
			for (const channel of [span.fg?.buffer, span.bg?.buffer]) {
				if (!channel) continue
				if (SCROLLBAR_COLORS.some((color) => color.every((value, at) => channel[at] === value))) return true
			}
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
