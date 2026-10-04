import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors } from "../../src/js/tcmd/components/FilterBar.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("FilterBar", () => {
	test("edits while the pane owns the filter, then shows the applied label", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const entries = [{ name: "notes.txt" }]
		const editing = { query: "not", paneId: "left", filtering: "left", entries }
		expect(behaviors.editing(null, editing)).toBe(true)
		expect(behaviors.focused(null, editing)).toBe(true)
		expect(behaviors.applied(null, editing)).toBe(false)
		expect(behaviors.visible(null, editing)).toBe(true)
		expect(behaviors.alert(null, editing)).toBe("")

		const applied = { query: "not", paneId: "left", filtering: null, entries }
		expect(behaviors.editing(null, applied)).toBe(false)
		expect(behaviors.applied(null, applied)).toBe(true)
		expect(behaviors.focused(null, applied)).toBe(false)
		expect(behaviors.label(null, applied)).toBe("not")
		expect(behaviors.prompt(null, applied)).toBe("/ ")
	})

	test("hides itself when the pane has no filter", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const idle = { query: "", paneId: "left", filtering: null, entries: [] }
		expect(behaviors.visible(null, idle)).toBe(false)
		expect(behaviors.applied(null, idle)).toBe(false)
		expect(behaviors.alert(null, idle)).toBe("")
	})

	test("alerts when a non-empty query matches nothing", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const data = { query: "zzz", paneId: "left", filtering: null, entries: [] }
		expect(behaviors.alert(null, data)).toBe("no match")
		expect(behaviors.alertFg()).toBe("warning")
		expect(behaviors.alert(null, { ...data, entries: [{ name: "a" }] })).toBe("")
		// A whitespace-only query is not an active filter.
		expect(behaviors.alert(null, { ...data, query: "   " })).toBe("")
	})

	test("tracks the pane filter cell reactively", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const query = cell("")
		const data = { query, paneId: "right", filtering: null, entries: [] }
		expect(behaviors.visible(null, data)).toBe(false)
		query.set("foo")
		expect(behaviors.visible(null, data)).toBe(true)
		expect(behaviors.label(null, data)).toBe("foo")
		expect(behaviors.alert(null, data)).toBe("no match")
	})
})
