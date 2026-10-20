import { describe, expect, test } from "bun:test"
import { createBehaviors, createEvents } from "../../src/js/tcmd/components/App.js"

function makeData(overrides = {}) {
	const calls = []
	return {
		calls,
		data: {
			active: "left",
			confirm: null,
			dispatch: (id, payload) => calls.push({ id, payload }),
			filtering: null,
			panelFocus: "args",
			panelItems: [],
			panelOpen: true,
			pickerOpen: false,
			panelTextual: false,
			pickerFocus: "path",
			pickerQuery: "",
			...overrides,
		},
	}
}

describe("App panel picker", () => {
	test("ctrl-o browses the focused argument", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData()
		behaviors.keys(null, data, { name: "o", ctrl: true })
		expect(calls).toEqual([{ id: "panel.browse", payload: undefined }])
	})

	test("the path field owns typing and commits on Enter", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ pickerOpen: true, pickerFocus: "path" })
		behaviors.keys(null, data, { name: "escape" })
		behaviors.keys(null, data, { name: "down" })
		behaviors.keys(null, data, { name: "tab" })
		behaviors.keys(null, data, { name: "return" })
		// Printable keys and Backspace are the input's; nothing is dispatched.
		behaviors.keys(null, data, { name: "x" })
		behaviors.keys(null, data, { name: "backspace" })
		expect(calls.map((call) => call.id)).toEqual([
			"picker.cancel",
			"picker.focusRows",
			"picker.focusRows",
			"picker.path",
		])
	})

	test("the entry list owns navigation and choice once focused", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ pickerOpen: true, pickerFocus: "rows" })
		const keys = [
			["up", undefined],
			["down", undefined],
			["left", undefined],
			["right", undefined],
			["return", undefined],
			["enter", { ctrl: true }],
			["tab", undefined],
		]
		for (const [name, mods] of keys) behaviors.keys(null, data, { name, ...(mods ?? {}) })
		expect(calls.map((call) => call.id)).toEqual([
			"picker.up",
			"picker.down",
			"picker.focusPath",
			"picker.descend",
			"picker.enter",
			"picker.chooseDir",
			"picker.focusPath",
		])
	})

	test("backspace steps up only when the picker path has no fragment", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const empty = makeData({ pickerOpen: true, pickerFocus: "rows", pickerQuery: "" })
		behaviors.keys(null, empty.data, { name: "backspace" })
		expect(empty.calls).toEqual([{ id: "picker.parent", payload: undefined }])
		// A typed fragment is edited by the path input instead.
		const typing = makeData({ pickerOpen: true, pickerFocus: "rows", pickerQuery: "doc" })
		behaviors.keys(null, typing.data, { name: "backspace" })
		expect(typing.calls).toEqual([])
	})

	test("typing while the rows are focused returns to the path field", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ pickerOpen: true, pickerFocus: "rows" })
		behaviors.keys(null, data, { name: "x" })
		expect(calls).toEqual([{ id: "picker.type", payload: { char: "x" } }])
	})

	test("clicking a picker row chooses it, Enter while picking chooses", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			pickerOpen: true,
			panelRows: [{ key: "/home/docs", type: "entry", isDir: true }],
		})
		events["panel:select"](null, data, { data: "/home/docs" })
		expect(calls).toEqual([
			{ id: "panel.focusArg", payload: undefined },
			{ id: "picker.setCursor", payload: { index: 0 } },
			{ id: "picker.enter", payload: undefined },
		])
		const confirm = makeData({ pickerOpen: true })
		events["panel:confirm"](null, confirm.data, {})
		expect(confirm.calls).toEqual([{ id: "picker.enter", payload: undefined }])
	})
})
