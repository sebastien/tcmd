import { describe, expect, test } from "bun:test"
import {
	commandBarMarks,
	commandBarMarksItem,
	commandBarRowCount,
	commandBarStatus,
	createBehaviors,
} from "../../src/js/tcmd/components/CommandBar.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandBar", () => {
	test("maps items to rows and exposes the web root class", () => {
		const rows = (self, data) => data.items
		const behaviors = createBehaviors({ ...behaviorEnv, listClass: "command-bar-keys", rows })
		expect(behaviors.listClass()).toBe("command-bar-keys")
		expect(behaviors.rows(null, { items: ["pane.enter"] })).toEqual(["pane.enter"])
	})

	test("omits hooks the renderer does not provide", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rows).toBeUndefined()
		expect(behaviors.listClass()).toBeUndefined()
	})

	test("shows keys by default and the status when something needs attention", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const quiet = { leftError: null, notice: null, rightError: null }
		expect(behaviors.status(null, quiet)).toBe("")
		expect(behaviors.showKeys(null, quiet)).toBe(true)
		expect(behaviors.showStatus(null, quiet)).toBe(false)

		const error = { leftError: "left boom", notice: null, rightError: null }
		expect(behaviors.status(null, error)).toBe("error: left boom")
		expect(behaviors.showKeys(null, error)).toBe(false)
		expect(behaviors.statusClass(null, error)).toBe("is-error")

		const notice = { leftError: null, notice: { kind: "tip", text: "copied 3 files" }, rightError: null }
		expect(behaviors.status(null, notice)).toBe("copied 3 files")
		expect(behaviors.showStatus(null, notice)).toBe(true)
		expect(behaviors.statusClass(null, notice)).toBeNull()
		expect(behaviors.statusFg(null, notice)).toBe("tip")
		expect(behaviors.statusBg(null, notice)).toBe("tipBg")

		const warning = { leftError: null, notice: { kind: "warning", text: "no file to edit" }, rightError: null }
		expect(behaviors.statusFg(null, warning)).toBe("warning")
		expect(behaviors.statusBg(null, warning)).toBe("warningBg")
	})

	test("prefers the session notice over pane errors", () => {
		expect(
			commandBarStatus({
				leftError: "left boom",
				notice: { kind: "error", text: "erase failed" },
				rightError: null,
			}),
		).toBe("error: erase failed")
	})

	test("turns the marked count into a trailing bar entry", () => {
		expect(commandBarMarksItem({ active: "left", leftMarked: new Set(["a"]), rightMarked: new Set() })).toEqual({
			id: null,
			title: "1 marked",
			dim: true,
		})
		expect(commandBarMarksItem({ active: "left", leftMarked: new Set(), rightMarked: new Set() })).toBeNull()
	})

	test("counts the rows the wrapped entries occupy", () => {
		const items = [
			{ id: "a", title: "Open", keys: "Enter" },
			{ id: "b", title: "Parent", keys: "←" },
			{ id: "c", title: "Bookmark", keys: "b" },
		]
		// Everything fits on one row when the width allows it.
		expect(commandBarRowCount(items, 80)).toBe(1)
		// "[Open ⏎] " is 9 columns, then "[Parent ←] | " 13 (the pipe divider),
		// then "[Bookmark b] | " 15: a 30-column bar holds the first two only.
		expect(commandBarRowCount(items, 30)).toBe(2)
		// At 22 columns Open and Parent still share the first row.
		expect(commandBarRowCount(items, 22)).toBe(2)
		// At 20 the divider pushes Parent onto its own row.
		expect(commandBarRowCount(items, 20)).toBe(3)
		// At 12 every entry needs its own row.
		expect(commandBarRowCount(items, 12)).toBe(3)
		// Unknown width assumes a single row.
		expect(commandBarRowCount(items, 0)).toBe(1)
		expect(commandBarRowCount(null, 40)).toBe(1)
	})
})
