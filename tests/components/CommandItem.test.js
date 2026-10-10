import { describe, expect, test } from "bun:test"
import { commandLabel, commandWidth, createBehaviors, isPrimary, keyGlyph } from "../../src/js/tcmd/components/CommandItem.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandItem", () => {
	test("labels commands as bracket shorthands", () => {
		expect(commandLabel({ title: "Open", keys: "Enter" })).toBe("[Open ⏎] ")
		expect(commandLabel({ title: "Bookmark", keys: "b" })).toBe("[Bookmark b] ")
		expect(commandLabel({ title: "Navigate", keys: "↑/↓" })).toBe("[Navigate ↑/↓] ")
		// Entries without a key are plain words (the marked count).
		expect(commandLabel({ title: "3 marked" })).toBe("3 marked ")
		expect(commandLabel(null)).toBe("")
	})

	test("maps shortcuts to glyphs and measures entries", () => {
		expect(keyGlyph("Enter")).toBe("⏎")
		expect(keyGlyph("Tab")).toBe("⇥")
		expect(keyGlyph("^P")).toBe("^P")
		expect(commandWidth({ title: "Open", keys: "Enter" })).toBe("[Open ⏎] ".length)
		expect(isPrimary({ primary: true })).toBe(true)
		expect(isPrimary({})).toBe(false)
	})

	test("renders the head, the accent key and the closer", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const primary = { item: { id: "pane.enter", title: "Open", keys: "Enter", primary: true } }
		const secondary = { item: { id: "pane.up", title: "Parent", keys: "←" } }
		expect(behaviors.itemHead(null, primary)).toBe("[Open ")
		expect(behaviors.keyText(null, primary)).toBe("⏎")
		expect(behaviors.endText(null, primary)).toBe("] ")
		// Primary keys take the accent, the rest the secondary accent.
		expect(behaviors.keyFg(null, primary)).toBe("accent")
		expect(behaviors.keyFg(null, secondary)).toBe("mark")
		// Heads are plain text; keyless entries are dim words without brackets.
		expect(behaviors.itemFg(null, secondary)).toBe("text")
		expect(behaviors.itemHead(null, { item: { title: "3 marked" } })).toBe("3 marked ")
		expect(behaviors.itemFg(null, { item: { title: "3 marked" } })).toBe("dim")
		expect(behaviors.keyText(null, { item: { title: "3 marked" } })).toBe("")
		expect(behaviors.endText(null, { item: { title: "3 marked" } })).toBe("")
	})
})
