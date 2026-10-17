import { describe, expect, test } from "bun:test"
import { createBehaviors, createRowBehaviors, helpBlocks, helpGroups, helpLines, keyGlyph } from "../../src/js/tcmd/components/Help.js"

const theme = {
	accentFg: "accent",
	borderPrimaryActiveFg: "border",
	surfaceBg: "panel",
	textFg: "text",
	textHeadingFg: "title",
	textSecondaryFg: "dim",
}

describe("components Help", () => {
	test("reports visibility and builds the two-column reference", () => {
		const behaviors = createBehaviors({ theme, rows: () => [] })
		expect(behaviors.open(null, { open: true })).toBe(true)
		expect(behaviors.open(null, { open: false })).toBe(false)
		const { left, right } = helpBlocks()
		const entries = [...left, ...right].filter((block) => block.type === "entry")
		expect(entries.length).toBeGreaterThan(0)
	})

	test("uses the theme tokens and a bar-style closing hint", () => {
		const behaviors = createBehaviors({ theme, rows: () => [] })
		expect(behaviors.bg()).toBe("panel")
		expect(behaviors.borderFg()).toBe("border")
		expect(behaviors.textFg()).toBe("text")
		expect(behaviors.titleFg()).toBe("title")
		expect(behaviors.bracketFg()).toBe("dim")
		expect(behaviors.headFg()).toBe("text")
		expect(behaviors.keyFg()).toBe("accent")
		// The footer reads like the bar: [Close Esc].
		expect(`${behaviors.hintOpen()}${behaviors.hintHead()}${behaviors.hintKeys()}${behaviors.hintClose()}`).toBe("[Close Esc]")
		expect(behaviors.rule()).toEqual(["top"])
	})

	test("key glyphs are human readable", () => {
		expect(keyGlyph({ key: "up" })).toBe("↑")
		expect(keyGlyph({ key: "w", ctrl: true })).toBe("^W")
		expect(keyGlyph({ key: "tab" })).toBe("Tab")
		expect(keyGlyph({ key: "tab", shift: true })).toBe("⇧Tab")
		expect(keyGlyph({ key: "o", shift: true })).toBe("⇧O")
	})

	test("rows reuse the command bar shorthand and colour the key", () => {
		expect(helpLines()).toContain("[Open →/⏎]")
		expect(helpLines()).toContain("[Switch ⇥/⇧⇥]")
		expect(helpLines()).toContain("[Help ?]")
		const row = createRowBehaviors({ theme })
		const entry = [...helpBlocks().left, ...helpBlocks().right].find((block) => block.key === "entry:pane.enter")
		expect(row.open(null, { item: entry })).toBe("[")
		expect(row.head(null, { item: entry }).startsWith("Open")).toBe(true)
		expect(row.head(null, { item: entry }).endsWith(" ")).toBe(true)
		expect(row.keys(null, { item: entry }).endsWith("⏎")).toBe(true)
		expect(row.close(null, { item: entry })).toBe("]")
		expect(row.headFg()).toBe("text")
		expect(row.keyFg()).toBe("accent")
		expect(row.bracketFg()).toBe("dim")
	})

	test("web help entries carry toolbar icons, labels and key badges", () => {
		const row = createRowBehaviors({ theme: { ...theme, lucideIcons: true } })
		const entry = [...helpBlocks().left, ...helpBlocks().right].find((block) => block.key === "entry:pane.enter")
		expect(entry.icon).toBe("arrow-right")
		expect(row.hasIcon(null, { item: entry })).toBe(true)
		expect(row.iconHref(null, { item: entry })).toBe("#lucide-arrow-right")
		expect(row.actionTitle(null, { item: entry })).toBe("Open")
		expect(row.shortcut(null, { item: entry })).toBe("⏎")
	})

	test("toolbar-backed help shortcuts match their command-bar labels", () => {
		const entries = new Map([...helpBlocks().left, ...helpBlocks().right].map((row) => [row.key, row]))
		expect(entries.get("entry:bookmark.record").shortcut).toBe("b")
		expect(entries.get("entry:list.mark").shortcut).toBe("Spc")
		expect(entries.get("entry:pane.enter").shortcut).toBe("⏎")
		expect(entries.get("entry:pane.toggle").shortcut).toBe("⇥")
		expect(entries.get("entry:history.redo").shortcut).toBe("^⇧Z")
	})

	test("sections are uppercase, bold and bright", () => {
		const row = createRowBehaviors({ theme })
		const section = helpBlocks().left.find((block) => block.type === "section")
		expect(row.isSection(null, { item: section })).toBe(true)
		expect(row.section(null, { item: section })).toBe(section.label)
		expect(row.section(null, { item: section })).toBe(row.section(null, { item: section }).toUpperCase())
		expect(row.sectionFg()).toBe("title")
		expect(row.sectionAttrs()).toBe(1)
	})

	test("every bracket is padded to one width and the keys align", () => {
		const { left, right } = helpBlocks()
		const entries = [...left, ...right].filter((block) => block.type === "entry")
		const widths = new Set(entries.map((entry) => `${entry.open}${entry.head}${entry.keys}${entry.close}`.length))
		expect(widths.size).toBe(1)
	})

	test("groups are ordered by category and list every binding", () => {
		const groups = helpGroups()
		expect(groups.map((group) => group.title)).toContain("Navigation")
		expect(groups.map((group) => group.title)).toContain("Panes")
		const lines = helpLines().join("\n")
		expect(lines).toContain("Cursor up")
		expect(lines).toContain("Open")
		expect(lines).toContain("^R")
		expect(lines).toContain("Bookmarks")
		expect(lines).toContain("Bookmark")
		// One row per command, with all distinct keymap chords represented.
		expect(lines).toContain("[Open →/⏎]")
		expect(lines).toContain("[Switch ⇥/⇧⇥]")
		expect(lines).not.toContain("Tabs")
		// The undo/trash/mkdir bindings land in their own sections.
		expect(groups.map((group) => group.title)).toContain("History")
		expect(groups.map((group) => group.title)).toContain("Trash")
		expect(lines).toContain("[Undo ^Z]")
		expect(lines).toContain("[Redo ⇧^Z/^Y]")
		expect(lines).toContain("[History U]")
		expect(lines).toContain("[Trash ⇧T]")
		expect(lines).toContain("[New directory N]")
	})

	test("splits the groups into two balanced columns", () => {
		const { left, right } = helpBlocks()
		expect(left.length).toBeGreaterThan(0)
		expect(right.length).toBeGreaterThan(0)
		// Nothing is dropped: every group heading appears in one column.
		const combined = [...left, ...right]
		for (const group of helpGroups()) {
			expect(combined.some((block) => block.type === "section" && block.label === group.title.toUpperCase())).toBe(true)
		}
		// The two columns are close in line count.
		expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(4)
		// No trailing blank line: each column ends on its last entry.
		expect(left.at(-1).type).not.toBe("spacer")
		expect(right.at(-1).type).not.toBe("spacer")
	})
})
