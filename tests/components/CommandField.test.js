import { describe, expect, test } from "bun:test"
import { createBehaviors, fieldValue } from "../../src/js/tcmd/components/CommandField.js"
import { panelFieldRows } from "../../src/js/tcmd/components/rows.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

// Captures what `panelFieldRows` passes to `Component.map`.
function fakeRow() {
	const calls = []
	return {
		calls,
		map(data, processor, key) {
			calls.push({ data, processor, key })
			return "MAPPED"
		},
	}
}

describe("CommandField", () => {
	test("fieldValue trims a descriptor's value", () => {
		expect(fieldValue({ value: "  /tmp " })).toBe("/tmp")
		expect(fieldValue({ value: "" })).toBe("")
		expect(fieldValue(null)).toBe("")
	})

	test("renders the name, the value and the empty placeholder", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, focusedClass: "is-focused" })
		const filled = { item: { name: "FIND", value: "notes.txt" }, index: 0, focused: false }
		expect(behaviors.name(null, filled)).toBe("FIND")
		expect(behaviors.nameFg()).toBe("dim")
		expect(behaviors.text(null, filled)).toBe("notes.txt")
		expect(behaviors.textFg(null, filled)).toBe("text")
		// An empty field shows a dim `(empty)` placeholder.
		const empty = { item: { name: "REPLACE", value: "" }, index: 1, focused: false }
		expect(behaviors.text(null, empty)).toBe("(empty)")
		expect(behaviors.textFg(null, empty)).toBe("dim")
	})

	test("only the focused field edits and grows", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, focusedClass: "is-focused" })
		const focused = { item: { name: "FIND", value: "a" }, index: 0, focused: true }
		const rest = { item: { name: "REPLACE", value: "" }, index: 1, focused: false }
		expect(behaviors.editing(null, focused)).toBe(true)
		expect(behaviors.focused(null, focused)).toBe(true)
		expect(behaviors.editing(null, rest)).toBe(false)
		expect(behaviors.boxGrow(null, focused)).toBe(1)
		expect(behaviors.boxGrow(null, rest)).toBe(0)
		expect(behaviors.fieldClass(null, focused)).toBe("is-focused")
		expect(behaviors.fieldClass(null, rest)).toBeNull()
	})
})

describe("panelFieldRows", () => {
	test("tags each field with the panel's field cursor and edit cell", () => {
		const Row = fakeRow()
		const fields = [
			{ fieldIndex: 0, argIndex: 0, name: "FIND", value: "a" },
			{ fieldIndex: 1, argIndex: 1, name: "REPLACE", value: "" },
		]
		const value = "shared"
		expect(panelFieldRows(Row)(null, { fields, fieldIndex: 1, focus: "field", value })).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toBe(fields)
		expect(call.processor(fields[0], 0)).toEqual({ item: fields[0], index: 0, focused: false, value })
		expect(call.processor(fields[1], 1)).toEqual({ item: fields[1], index: 1, focused: true, value })
		expect(call.key(fields[0])).toBe("field:0")
	})

	test("no field is focused while the panel focus is elsewhere", () => {
		const Row = fakeRow()
		const fields = [{ fieldIndex: 0, argIndex: 0, name: "FIND", value: "a" }]
		panelFieldRows(Row)(null, { fields, fieldIndex: 0, focus: "ops", value: "" })
		expect(Row.calls[0].processor(fields[0], 0).focused).toBe(false)
	})
})
