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

	test("priorityLine degrades by information value, never mid-token", () => {
		const entries = [
			{ isDir: true, size: 0 },
			{ isDir: false, size: 2048 },
		]
		const disk = { free: 1024, total: 2048 }
		const measure = (text) => text.length
		const elide = (text, width) => `${text.slice(0, Math.max(0, width - 1))}…`
		const at = (width) => createBehaviors({ ...behaviorEnv, width: () => width, measure, elide })

		// Roomy: the full line.
		expect(at(60).priorityLine(null, { entries, disk })).toBe(
			"1 dirs, 1 files, 2.0K · 1.0K free of 2.0K",
		)
		// Tighter: the disk detail shortens.
		expect(at(36).priorityLine(null, { entries, disk })).toBe("1 dirs, 1 files, 2.0K · 1.0K free")
		// Tighter still: counts only.
		expect(at(22).priorityLine(null, { entries, disk })).toBe("1 dirs, 1 files, 2.0K")
		// Narrow: elided counts.
		expect(at(12).priorityLine(null, { entries, disk })).toContain("…")
	})
})
