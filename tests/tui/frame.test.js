import { describe, expect, test } from "bun:test"
import { BAR_COMPACT_WIDTH, createFrameBehaviors, helpLines, INSPECTOR_INLINE_WIDTH, keyGlyph } from "../../src/js/tcmd/tui/frame.js"

const theme = {
	borderPrimaryFg: "frame",
	textHeadingFg: "title",
}

// A fake instance whose renderer dimensions stand in for the viewport.
const selfAt = (width, height) => ({ ctx: { width, height } })

describe("tui frame", () => {
	test("frame title carries identity, host and path", () => {
		const behaviors = createFrameBehaviors({ theme })
		const data = { appHost: "devbox", appPath: "/home/tester" }
		expect(behaviors.frameTitle(selfAt(80, 24), data)).toBe(" TinyCmd - devbox /home/tester ")
		// No host: just the path.
		expect(behaviors.frameTitle(selfAt(80, 24), { appHost: "", appPath: "/etc" })).toBe(
			" TinyCmd - /etc ",
		)
	})

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

	test("the compact-bar breakpoint is above the inspector one", () => {
		expect(BAR_COMPACT_WIDTH).toBeGreaterThan(INSPECTOR_INLINE_WIDTH)
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
