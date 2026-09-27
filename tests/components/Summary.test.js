import { describe, expect, test } from "bun:test"
import { createBehaviors, summaryText } from "../../src/js/tcmd/components/Summary.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Summary", () => {
	test("builds the counts and disk line", () => {
		const entries = [{ isDir: false, size: 2048 }]
		expect(summaryText(entries, null)).toBe("0 dirs, 1 files, 2.0K")
		expect(summaryText(entries, { free: 1024, total: 2048 })).toBe(
			"0 dirs, 1 files, 2.0K · 1.0K free of 2.0K",
		)
	})

	test("elides through the optional renderer hooks", () => {
		const entries = [{ isDir: false, size: 2048 }]
		const elided = createBehaviors({
			...behaviorEnv,
			width: () => 4,
			elide: (text, width) => text.slice(0, width),
		})
		expect(elided.line(null, { entries, disk: null })).toBe("0 di")
		expect(elided.lineFg()).toBe("dim")

		// No hooks: the full text is returned.
		const plain = createBehaviors(behaviorEnv)
		expect(plain.line(null, { entries, disk: null })).toBe("0 dirs, 1 files, 2.0K")
	})
})
