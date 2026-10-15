// The `?` overlay and the modifier-aware command bar: the help reference reads
// as two balanced columns of bar shorthand, and holding Shift/Ctrl (kitty
// keyboard protocol) swaps the bar to that modifier's own chords.

import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { attachModifierHint, createAppComponent } from "../../src/js/tcmd/tui/app.js"
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
	const viewer = cell(false)
	const App = createAppComponent(session, { size, help, viewer })
	const { testRender } = await import("select.tui")
	const setup = await testRender(App, { width, height, kittyKeyboard: true })
	attachModifierHint(session, setup.renderer.keyInput)
	await setup.renderOnce()
	return { setup, session, help, size }
}

// Emit a raw kitty key sequence: a modifier press or release.
function kitty(setup, sequence) {
	setup.renderer.stdin.emit("data", Buffer.from(sequence))
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

describe("help overlay and modifier bar", () => {
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

	test("holding Shift reveals the shift chords; releasing restores", async () => {
		const { setup } = await makeSetup()
		try {
			expect(setup.captureCharFrame()).toContain("[Open ⏎]")

			// LEFT_SHIFT press (kitty CSI 57441u).
			kitty(setup, "\x1B[57441u")
			await settle(setup)
			const shift = setup.captureCharFrame()
			expect(shift).toContain("[Maximize preview ⇧V]")
			expect(shift).toContain("[Open file ⇧O]")
			expect(shift).toContain("[Switch ⇧⇥]")
			expect(shift).toContain("[Help ?]")
			expect(shift).not.toContain("[Open ⏎]")

			// LEFT_SHIFT release (kitty CSI 57441;1:3u).
			kitty(setup, "\x1B[57441;1:3u")
			await settle(setup)
			const restored = setup.captureCharFrame()
			expect(restored).toContain("[Open ⏎]")
			expect(restored).not.toContain("[Maximize preview ⇧V]")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("holding Ctrl reveals the ctrl chords", async () => {
		const { setup } = await makeSetup()
		try {
			// LEFT_CONTROL press (kitty CSI 57442u).
			kitty(setup, "\x1B[57442u")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("[Reload ^R]")
			expect(frame).toContain("[Jump up ^↑]")
			expect(frame).not.toContain("[Open ⏎]")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shows a scrollbar only when the reference overflows", async () => {
		const short = await makeSetup(100, 14)
		try {
			short.help.set(true)
			await settle(short.setup)
			expect(hasScrollBar(short.setup)).toBe(true)
			// Growing the viewport away from the overflow drops the bar.
			short.size.set({ width: 100, height: 60 })
			await settle(short.setup)
			expect(hasScrollBar(short.setup)).toBe(false)
			// Shrinking it back brings the bar again.
			short.size.set({ width: 100, height: 14 })
			await settle(short.setup)
			expect(hasScrollBar(short.setup)).toBe(true)
		} finally {
			short.setup.renderer.destroy()
		}

		const tall = await makeSetup(100, 50)
		try {
			tall.help.set(true)
			await settle(tall.setup)
			expect(hasScrollBar(tall.setup)).toBe(false)
		} finally {
			tall.setup.renderer.destroy()
		}
	})
})
