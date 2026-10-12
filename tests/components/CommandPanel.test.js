import { describe, expect, test } from "bun:test"
import {
	PANEL_FOOTER,
	createBehaviors,
	panelSign,
	panelTitle,
} from "../../src/js/tcmd/components/CommandPanel.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandPanel", () => {
	test("titles itself with the selected entry", () => {
		expect(panelTitle({ name: "copy" })).toBe(" Command · copy ")
		expect(panelTitle({ name: "Open file" })).toBe(" Command · Open file ")
		expect(panelTitle(null)).toBe(" Command ")
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.title(null, { entry: { name: "move" } })).toBe(" Command · move ")
	})

	test("shows a prompt before the command filter input", () => {
		// The sign carries a trailing space so typed text doesn't crowd it.
		expect(panelSign()).toBe("› ")
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.sign()).toBe("› ")
	})

	test("exposes the overlay tokens and the footer", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.bg()).toBe("palette")
		expect(behaviors.footer()).toBe(PANEL_FOOTER)
		expect(behaviors.open(null, { open: true })).toBe(true)
		expect(behaviors.open(null, { open: false })).toBe(false)
	})

	test("an entry with no bound arguments shows the empty state", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.argsEmptyText()).toBe("no arguments")
		// A TinyCmd action binds nothing; a CLI operation always has rows.
		expect(behaviors.argsEmpty(null, { rows: [] })).toBe(true)
		expect(behaviors.argsEmpty(null, { rows: [{ key: "arg:0" }] })).toBe(false)
	})

	test("draws a rule between the columns and above the runs preview", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// The vertical divider owns its box's left edge; the horizontal one
		// sits at the top of its rule row, in the secondary border colour.
		expect(behaviors.sideRule()).toEqual(["left"])
		expect(behaviors.headRule()).toEqual(["top"])
		expect(behaviors.ruleFg()).toBe("border")
	})

	test("previews the assembled command and flags an unrunnable draft", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.previewLabel()).toBe("runs")
		expect(behaviors.preview(null, { command: "/home/a /tmp" })).toBe("/home/a /tmp")
		expect(behaviors.previewFg(null, { runnable: true })).toBe("accent")
		// An unfilled required argument renders the preview as an error.
		expect(behaviors.previewFg(null, { runnable: false })).toBe("error")
		// The "runs" label wears the same colour as the command line.
		expect(behaviors.previewLabelFg(null, { runnable: true })).toBe("accent")
		expect(behaviors.previewLabelFg(null, { runnable: false })).toBe("error")
	})

	test("the text field appears only for a focused textual argument", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.fieldVisible(null, { textual: true, focus: "args" })).toBe(true)
		expect(behaviors.fieldVisible(null, { textual: true, focus: "ops" })).toBe(false)
		expect(behaviors.fieldVisible(null, { textual: false, focus: "args" })).toBe(false)
		expect(behaviors.fieldPrompt(null, { argRow: { type: "arg", name: "TO" } })).toBe("TO: ")
		expect(behaviors.fieldPrompt(null, { argRow: { type: "item" } })).toBe("")
	})

	test("tracks the focused column and the filter focus", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.focusArgs(null, { focus: "args" })).toBe(true)
		expect(behaviors.focusOps(null, { focus: "args" })).toBe(false)
		expect(behaviors.focusOps(null, { focus: "ops" })).toBe(true)
		// The filter input takes focus only while the panel is open and the
		// command column owns the cursor.
		expect(behaviors.queryFocused(null, { open: true, focus: "ops" })).toBe(true)
		expect(behaviors.queryFocused(null, { open: true, focus: "args" })).toBe(false)
		expect(behaviors.queryFocused(null, { open: false, focus: "ops" })).toBe(false)
	})

	test("rows are wired only when the renderer provides them", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.opRows).toBeUndefined()
		expect(behaviors.argRows).toBeUndefined()
		const withRows = createBehaviors({
			...behaviorEnv,
			opRows: (self, data) => data.items,
			argRows: (self, data) => data.rows,
		})
		expect(withRows.opRows(null, { items: [1] })).toEqual([1])
		expect(withRows.argRows(null, { rows: [2] })).toEqual([2])
	})
})
