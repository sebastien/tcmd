import { describe, expect, test } from "bun:test"
import {
	createBehaviors as overlayBehaviors,
	overlayEmpty,
	overlayFooter,
	overlayTitle,
} from "../../src/js/tcmd/components/OverlayList.js"
import { createBehaviors as rowBehaviors, rowCurrent } from "../../src/js/tcmd/components/OverlayRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("OverlayList", () => {
	test("switches title, footer and empty text on the mode", () => {
		expect(overlayTitle("history")).toBe("history")
		expect(overlayTitle("trash")).toBe("trash")
		expect(overlayFooter("history")).toContain("jump")
		expect(overlayFooter("trash")).toContain("restore")
		expect(overlayEmpty("history")).toContain("no history")
		expect(overlayEmpty("trash")).toContain("empty")
	})

	test("behaviors mirror the mode and gate the empty state", () => {
		const behaviors = overlayBehaviors(behaviorEnv)
		expect(behaviors.open(null, { open: "history" })).toBe(true)
		expect(behaviors.open(null, { open: null })).toBe(false)
		expect(behaviors.title(null, { mode: "trash" })).toBe("trash")
		expect(behaviors.emptyVisible(null, { items: [] })).toBe(true)
		expect(behaviors.emptyVisible(null, { items: [{ key: "x" }] })).toBe(false)
		expect(behaviors.bg()).toBe(behaviorEnv.overlayBg)
		expect(behaviors.footerFg()).toBe(behaviorEnv.textSecondaryFg)
	})

	test("wires the rows and scroll hooks when the environment provides them", () => {
		const behaviors = overlayBehaviors({ ...behaviorEnv, rows: () => "ROWS", scrollTop: () => 3 })
		expect(behaviors.rows(null, {})).toBe("ROWS")
		expect(behaviors.scrollTop(null, {})).toBe(3)
		// Without the hooks the behaviors are absent.
		expect(overlayBehaviors(behaviorEnv).rows).toBeUndefined()
	})
})

describe("OverlayRow", () => {
	test("reads the plain cursor flag and the shared cursor fallback", () => {
		expect(rowCurrent({ index: 1, currentRow: true })).toBe(true)
		expect(rowCurrent({ index: 1, currentRow: false })).toBe(false)
		expect(rowCurrent({ index: 1, cursor: 1 })).toBe(true)
	})

	test("colours the cursor row and dims undone/superseded rows", () => {
		const behaviors = rowBehaviors(behaviorEnv)
		const item = { text: "mkdir docs", meta: "current", dim: false }
		expect(behaviors.rowMarker(null, { item, index: 0, currentRow: true })).toBe("> ")
		expect(behaviors.rowText(null, { item, index: 0, currentRow: true })).toBe("mkdir docs")
		expect(behaviors.rowTextFg(null, { item, index: 0, currentRow: true })).toBe(behaviorEnv.textHeadingFg)
		expect(behaviors.rowTextFg(null, { item, index: 0, currentRow: false })).toBe(behaviorEnv.textFg)
		expect(behaviors.rowTextFg(null, { item: { ...item, dim: true }, index: 0, currentRow: false })).toBe(
			behaviorEnv.textSecondaryFg,
		)
		expect(behaviors.rowMeta(null, { item })).toBe("current")
		expect(behaviors.rowBg(null, { index: 0, currentRow: true })).toBe(behaviorEnv.cursorBg)
		expect(behaviors.rowClass(null, { index: 0, currentRow: true })).toBe(behaviorEnv.currentClass)
		expect(behaviors.rowDim(null, { item: { ...item, dim: true } })).toBe("true")
		expect(behaviors.rowDim(null, { item })).toBe("false")
	})
})
