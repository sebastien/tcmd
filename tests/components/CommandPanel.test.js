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

	test("shows a colon prompt before the command filter input", () => {
		// The prompt is the `:` that opens the panel.
		expect(panelSign()).toBe(":")
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.sign()).toBe(":")
	})

	test("exposes the overlay tokens and the footer", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.bg()).toBe("palette")
		expect(behaviors.footer()).toBe(PANEL_FOOTER)
		expect(behaviors.open(null, { open: true })).toBe(true)
		expect(behaviors.open(null, { open: false })).toBe(false)
		// The close shorthand moved to the dialog's upper-right corner, so the
		// footer no longer repeats it.
		expect(behaviors.closeHint()).toBe("[Close Esc]")
		expect(behaviors.closeHintFg()).toBe("dim")
		expect(PANEL_FOOTER).not.toContain("Esc")
		// The permission grid advertises its extra bit cursor.
		expect(behaviors.footer(null, { entry: { name: "chmod" } })).toBe(`${PANEL_FOOTER}   ←→ bits`)
		// An armed risky action advertises the confirmation step.
		expect(
			behaviors.footer(null, { entry: { name: "delete" }, rows: [{ type: "run", armed: true }] }),
		).toBe(PANEL_FOOTER.replace("↵ run", "↵ confirm"))
		// A focused path/destination argument advertises Enter as Browse, even
		// while the command is armed.
		expect(
			behaviors.footer(null, {
				entry: { name: "copy" },
				focus: "args",
				argCursor: 1,
				rows: [
					{ type: "arg", name: "FROM" },
					{ type: "arg", name: "TO", picker: true },
					{ type: "run", armed: true },
				],
			}),
		).toBe(PANEL_FOOTER.replace("↵ run", "↵ browse"))
	})

	test("prints the armed command below Confirm in the action colour", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const rows = [{ type: "run", armed: true, command: "delete /home/docs" }]
		expect(behaviors.confirmCommand(null, { rows })).toBe("delete /home/docs")
		expect(behaviors.hasConfirmCommand(null, { rows })).toBe(true)
		expect(behaviors.hasConfirmCommand(null, { rows: [{ type: "run", command: null }] })).toBe(false)
		expect(behaviors.confirmRisk(null, { entry: { risk: "destructive" } })).toBe("destructive")
		expect(behaviors.confirmCommandFg(null, { entry: { risk: "destructive" } })).toBe("error")
		expect(behaviors.confirmCommandFg(null, { entry: { risk: "caution" } })).toBe("warning")
	})

	test("shows a run error in its framed block", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const rows = [{ type: "arg" }, { type: "run", error: "already exists" }]
		expect(behaviors.hasRunError(null, { rows })).toBe(true)
		expect(behaviors.runError(null, { rows })).toBe("already exists")
		expect(behaviors.runErrorFg()).toBe("error")
		expect(behaviors.hasRunError(null, { rows: [{ type: "run" }] })).toBe(false)
	})

	test("passes the editable picker path and rows to the FilePicker", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const rows = [{ type: "parent" }, { type: "entry" }]
		expect(
			behaviors.pickerView(null, {
				picking: true,
				pickerPathText: "/home/",
				pickerFocus: "path",
				pickerRows: rows,
				argCursor: 1,
			}),
		).toEqual({ open: true, path: "/home/", focus: "path", rows, cursor: 1 })
	})

	test("draws a rule between the columns and under the filter", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// The vertical divider owns its box's left edge; the horizontal one
		// sits below the command filter, in the secondary border colour.
		expect(behaviors.sideRule()).toEqual(["left"])
		expect(behaviors.headRule()).toEqual(["top"])
		expect(behaviors.ruleFg()).toBe("border")
	})

	test("heads the argument pane with the command name and focuses the filter", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.commandName(null, { entry: { name: "rename" } })).toBe("rename")
		expect(behaviors.commandName(null, {})).toBe("")
		expect(behaviors.commandNameFg()).toBe("title")
		// The filter input owns the keyboard unless the argument pane does.
		expect(behaviors.queryFocused(null, { open: true, focus: "ops" })).toBe(true)
		expect(behaviors.queryFocused(null, { open: true, focus: "args" })).toBe(false)
		expect(behaviors.queryFocused(null, { open: false, focus: "ops" })).toBe(false)
		expect(behaviors.queryFocused(null, { open: true, focus: "ops", picking: true })).toBe(false)
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

	test("uses the renderer's panel height when provided", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, panelHeight: () => 15 })
		expect(behaviors.panelHeight()).toBe(15)
		expect(createBehaviors(behaviorEnv).panelHeight()).toBe("72%")
	})

	test("renders only operation-specific preflight output", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.hasPreview(null, { preview: "a → b" })).toBe(true)
		expect(behaviors.preview(null, { preview: "a → b" })).toBe("a → b")
		expect(behaviors.hasPreview(null, { preview: null })).toBe(false)
	})
})
