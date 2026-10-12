import { describe, expect, test } from "bun:test"
import { createBehaviors, helpLines, keyGlyph } from "../../src/js/tcmd/components/Help.js"

const theme = {
	borderPrimaryActiveFg: "border",
	textSecondaryFg: "dim",
	surfaceBg: "panel",
	textFg: "text",
	textHeadingFg: "title",
}

describe("components Help", () => {
	test("reports visibility and builds the grouped reference", () => {
		const behaviors = createBehaviors({ theme })
		expect(behaviors.open(null, { open: true })).toBe(true)
		expect(behaviors.open(null, { open: false })).toBe(false)
		const text = behaviors.text()
		expect(text).toContain("Navigation")
		expect(text).toContain("Open")
	})

	test("uses the theme tokens and a closing hint", () => {
		const behaviors = createBehaviors({ theme })
		expect(behaviors.bg()).toBe("panel")
		expect(behaviors.borderFg()).toBe("border")
		expect(behaviors.textFg()).toBe("text")
		expect(behaviors.titleFg()).toBe("title")
		expect(behaviors.hint()).toContain("close")
	})

	test("key glyphs are human readable", () => {
		expect(keyGlyph({ key: "up" })).toBe("↑")
		expect(keyGlyph({ key: "w", ctrl: true })).toBe("^W")
		expect(keyGlyph({ key: "tab" })).toBe("Tab")
		expect(keyGlyph({ key: "tab", shift: true })).toBe("Tab")
		expect(keyGlyph({ key: "o", shift: true })).toBe("⇧O")
	})

	test("help lines are grouped and list every binding", () => {
		const lines = helpLines().join("\n")
		expect(lines).toContain("Navigation")
		expect(lines).toContain("Panes")
		expect(lines).toContain("Cursor up")
		expect(lines).toContain("Open")
		expect(lines).toContain("^R")
		expect(lines).toContain("Bookmarks")
		expect(lines).toContain("Bookmark")
		// One row per command, derived from the registry.
		expect(lines).not.toContain("Tabs")
	})
})
