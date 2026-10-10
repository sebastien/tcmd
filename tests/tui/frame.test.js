import { describe, expect, test } from "bun:test"
import { createFrameBehaviors, helpLines, INSPECTOR_INLINE_WIDTH, keyGlyph } from "../../src/js/tcmd/tui/frame.js"

const theme = {
	textHeadingFg: "title",
}

// A fake instance whose renderer dimensions stand in for the viewport.
const selfAt = (width, height) => ({ ctx: { width, height } })

describe("tui frame", () => {
	test("the minimum-size gate fires below the breakpoint", () => {
		const behaviors = createFrameBehaviors({ theme })
		expect(behaviors.tooSmall(selfAt(50, 12), {})).toBe(true)
		expect(behaviors.tooSmall(selfAt(64, 16), {})).toBe(false)
		expect(behaviors.tooSmall(selfAt(100, 30), {})).toBe(false)
		expect(behaviors.minSizeHint(selfAt(50, 12), {})).toContain("need 64x16")
		// Unknown size: never gate (tests, web).
		expect(behaviors.tooSmall(selfAt(0, 0), {})).toBe(false)
	})

	test("the inline inspector yields to the viewer when narrow", () => {
		const behaviors = createFrameBehaviors({ theme })
		const on = { showPreview: true, viewerOpen: false }
		const wide = selfAt(INSPECTOR_INLINE_WIDTH, 30)
		const narrow = selfAt(INSPECTOR_INLINE_WIDTH - 1, 30)
		expect(behaviors.inspectorNarrow(wide, on)).toBe(false)
		expect(behaviors.showInspectorInline(wide, on)).toBe(true)
		expect(behaviors.inspectorNarrow(narrow, on)).toBe(true)
		expect(behaviors.showInspectorInline(narrow, on)).toBe(false)
		expect(behaviors.showViewer(narrow, { showPreview: false, viewerOpen: true })).toBe(true)
	})

	test("the command bar wraps and the listing windows around it", () => {
		const behaviors = createFrameBehaviors({ theme })
		const items = [
			{ id: "pane.enter", title: "Open", keys: "Enter" },
			{ id: "pane.up", title: "Parent", keys: "←" },
		]
		const data = { commandBarItems: items, active: "left", leftMarked: new Set(), rightMarked: new Set() }
		// Two entries share one row on a wide viewport.
		expect(behaviors.barHeight(selfAt(120, 30), data)).toBe(1)
		// A 20-column bar only holds "[Open ⏎] " (9 columns) per row.
		expect(behaviors.barHeight(selfAt(20, 30), data)).toBe(2)
		// A notice or error swaps the keys for a one-line status.
		expect(behaviors.barHeight(selfAt(20, 30), { ...data, notice: { kind: "tip", text: "hi" } })).toBe(1)
		// The listing windows around the chrome: eight fixed rows plus the
		// bar. 30 - 8 - 1 = 21 listing rows with a one-row bar.
		expect(behaviors.listViewport(selfAt(120, 30), { ...data, commandBarItems: [] })).toBe(21)
		// Unknown size: render everything to measure.
		expect(behaviors.listViewport(selfAt(0, 0), data)).toBe(0)
	})

	test("pane boxes tile with a full border each and a header rule", () => {
		const behaviors = createFrameBehaviors({ theme })
		// Each pane draws all four edges so its border colour tracks its own
		// focus; the middle therefore shows two adjacent rules.
		expect(behaviors.leftBorder()).toEqual(["top", "left", "bottom", "right"])
		expect(behaviors.rightBorder()).toEqual(["top", "left", "bottom", "right"])
		// A top-only border renders the header rule.
		expect(behaviors.headRule()).toEqual(["top"])
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
