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

	test("previews the resolved command dimly and reports runnable state", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.preview(null, { command: "/home/a /tmp" })).toBe("/home/a /tmp")
		// The resolved line is dim; the focused missing field and the `«NAME»`
		// placeholder carry the "not runnable" signal.
		expect(behaviors.previewFg()).toBe("dim")
		expect(behaviors.runnableState(null, { runnable: true })).toBe("true")
		expect(behaviors.runnableState(null, { runnable: false })).toBe("false")
	})

	test("the command row focuses its name field and suggests a completion", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.nameFocused(null, { open: true, focus: "ops" })).toBe(true)
		expect(behaviors.nameFocused(null, { open: true, focus: "field" })).toBe(false)
		// A closed panel never focuses its hidden field.
		expect(behaviors.nameFocused(null, { open: false, focus: "ops" })).toBe(false)
		// The picker hides the name field.
		expect(behaviors.nameFocused(null, { open: true, focus: "ops", picking: true })).toBe(false)
		expect(behaviors.nameText(null, { query: "ren" })).toBe("ren")
		expect(behaviors.ghostVisible(null, { open: true, focus: "ops", completion: "ame" })).toBe(true)
		expect(behaviors.ghostVisible(null, { open: true, focus: "ops", completion: "" })).toBe(false)
		expect(behaviors.ghostVisible(null, { open: true, focus: "field", completion: "ame" })).toBe(false)
		expect(behaviors.ghost(null, { completion: "ame" })).toBe("ame")
		expect(behaviors.nameWidth(null, { query: "ren" })).toBe(5)
	})

	test("tracks the focused column", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.focusArgs(null, { focus: "args" })).toBe(true)
		expect(behaviors.focusOps(null, { focus: "args" })).toBe(false)
		expect(behaviors.focusOps(null, { focus: "ops" })).toBe(true)
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
