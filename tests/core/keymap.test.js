import { describe, expect, test } from "bun:test"
import { DEFAULT_KEYMAP, matchKeymap } from "../../src/js/tcmd/core/keymap.js"

describe("keymap", () => {
	test("matches plain and ctrl chords", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "down" })).toBe("nav.down")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "r", ctrl: true })).toBe("pane.reload")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "r" })).toBeNull()
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "f1" })).toBeNull()
	})

	test("tab and shift-tab both switch panes", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "tab" })).toBe("pane.toggle")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "tab", shift: true })).toBe("pane.toggle")
	})

	test("escape and shift-escape walk the pane history", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "escape" })).toBe("pane.back")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "escape", shift: true })).toBe("pane.forward")
	})

	test("ctrl-arrows jump the cursor by a few lines", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "up", ctrl: true })).toBe("nav.jumpUp")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "down", ctrl: true })).toBe("nav.jumpDown")
	})

	test("requires the modifiers to match exactly", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "left", ctrl: true })).toBeNull()
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "r", ctrl: true, shift: true })).toBeNull()
		expect(matchKeymap(DEFAULT_KEYMAP, {})).toBeNull()
	})

	test("the panel is the only command entry point", () => {
		expect(matchKeymap(DEFAULT_KEYMAP, { name: ":" })).toBe("panel.open")
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "!" })).toBe("panel.shell")
		// The Ctrl-P palette, and the second binding it used to share with `:`.
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "p", ctrl: true })).toBeNull()
		expect(matchKeymap(DEFAULT_KEYMAP, { name: "m" })).toBeNull()
	})

	test("binds every entry to a command id", () => {
		for (const binding of DEFAULT_KEYMAP) {
			expect(binding.key.length).toBeGreaterThan(0)
			expect(binding.command).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
		}
	})
})
