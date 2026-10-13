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
			panelPicking: false,
			panelTextual: false,
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

	test("the picker sub-mode owns navigation, choice and its own cancel", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const picker = (overrides) => makeData({ panelPicking: true, ...overrides })
		const keys = [
			["escape", undefined],
			["tab", undefined],
			["up", undefined],
			["down", undefined],
			["right", undefined],
			["return", undefined],
			["enter", { ctrl: true }],
		]
		const run = picker()
		for (const [name, mods] of keys) behaviors.keys(null, run.data, { name, ...(mods ?? {}) })
		expect(run.calls.map((call) => call.id)).toEqual([
			"panel.pick.cancel",
			"panel.pick.cancel",
			"panel.pick.up",
			"panel.pick.down",
			"panel.pick.descend",
			"panel.pick.enter",
			"panel.pick.chooseDir",
		])
	})

	test("backspace steps up only when the picker filter is empty", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const empty = makeData({ panelPicking: true, pickerQuery: "" })
		behaviors.keys(null, empty.data, { name: "backspace" })
		expect(empty.calls).toEqual([{ id: "panel.pick.parent", payload: undefined }])
		// A non-empty filter: the input owns Backspace and edits itself.
		const typing = makeData({ panelPicking: true, pickerQuery: "doc" })
		behaviors.keys(null, typing.data, { name: "backspace" })
		behaviors.keys(null, typing.data, { name: "x" })
		expect(typing.calls).toEqual([])
	})

	test("clicking a picker row chooses it, Enter while picking chooses", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			panelPicking: true,
			panelRows: [{ key: "/home/docs", type: "entry", isDir: true }],
		})
		events["panel:select"](null, data, { data: "/home/docs" })
		expect(calls).toEqual([
			{ id: "panel.focusArg", payload: undefined },
			{ id: "panel.pick.setCursor", payload: { index: 0 } },
			{ id: "panel.pick.enter", payload: undefined },
		])
		const confirm = makeData({ panelPicking: true })
		events["panel:confirm"](null, confirm.data, {})
		expect(confirm.calls).toEqual([{ id: "panel.pick.enter", payload: undefined }])
	})
})
