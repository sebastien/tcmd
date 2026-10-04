import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/tui/help.js"

const theme = {
	borderPrimaryActiveFg: "border",
	textSecondaryFg: "dim",
	surfaceBg: "panel",
	textFg: "text",
	textHeadingFg: "title",
}

describe("tui help", () => {
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
})
