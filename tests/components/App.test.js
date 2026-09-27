import { describe, expect, test } from "bun:test"
import { createBehaviors, createEvents, createInit } from "../../src/js/tcmd/components/App.js"

function makeData(overrides = {}) {
	const calls = []
	return {
		calls,
		data: {
			active: "left",
			confirm: null,
			dispatch: (id, payload) => calls.push({ id, payload }),
			filtering: null,
			leftError: null,
			leftFilter: null,
			paletteIndex: 0,
			paletteItems: [],
			paletteMode: "ui",
			paletteOpen: false,
			paletteQuery: "",
			rightError: null,
			rightFilter: null,
			...overrides,
		},
	}
}

describe("App", () => {
	test("init exposes session cells and pane ids", () => {
		const left = {
			cursor: "lc",
			disk: "ld",
			entries: "le",
			error: "lerr",
			filter: "lf",
			marked: "lm",
			segments: "ls",
		}
		const right = {
			cursor: "rc",
			disk: "rd",
			entries: "re",
			error: "rerr",
			filter: "rf",
			marked: "rm",
			segments: "rs",
		}
		const session = {
			active: "active",
			activePath: "ap",
			commandBarItems: "barItems",
			confirm: "confirm",
			dispatch: "dispatch",
			filtering: "filtering",
			host: "test-host",
			notice: "notice",
			paletteIndex: "pi",
			paletteItems: "pit",
			paletteMode: "pm",
			paletteOpen: "po",
			paletteQuery: "pq",
			panes: { left, right },
			preview: "preview",
			showPreview: "showPreview",
		}
		expect(createInit(session)()).toMatchObject({
			active: "active",
			appHost: "test-host",
			appPath: "ap",
			commandBarItems: "barItems",
			confirm: "confirm",
			dispatch: "dispatch",
			filtering: "filtering",
			leftCursor: "lc",
			leftFilter: "lf",
			leftId: "left",
			notice: "notice",
			paletteItems: "pit",
			paletteMode: "pm",
			preview: "preview",
			rightCursor: "rc",
			rightFilter: "rf",
			rightId: "right",
			showPreview: "showPreview",
		})
	})

	test("keys dispatch keymap chords for the active pane", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData()
		behaviors.keys(null, data, { name: "down" })
		behaviors.keys(null, data, { name: "f1" })
		expect(calls).toEqual([{ id: "nav.down", payload: { paneId: "left" } }])
	})

	test("keys route app.quit to the environment", () => {
		let quitWith = null
		const behaviors = createBehaviors({ quit: (self) => (quitWith = self) })
		behaviors.keys("SELF", makeData().data, { name: "q" })
		expect(quitWith).toBe("SELF")
	})

	test("palette mode routes navigation, completion and close to commands", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ paletteOpen: true, paletteQuery: "sw" })
		behaviors.keys(null, data, { name: "down" })
		behaviors.keys(null, data, { name: "up" })
		behaviors.keys(null, data, { name: "tab" })
		behaviors.keys(null, data, { name: "escape" })
		expect(calls).toEqual([
			{ id: "palette.down", payload: undefined },
			{ id: "palette.up", payload: undefined },
			{ id: "palette.complete", payload: undefined },
			{ id: "palette.toggle", payload: undefined },
		])
	})

	test("palette mode shift-tab walks the list backwards", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ paletteOpen: true })
		behaviors.keys(null, data, { name: "tab", shift: true })
		expect(calls).toEqual([{ id: "palette.up", payload: undefined }])
	})

	test("shift-tab reaches the keymap outside the palette", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData()
		behaviors.keys(null, data, { name: "tab", shift: true })
		expect(calls).toEqual([{ id: "pane.toggle", payload: { paneId: "left" } }])
	})

	test("filter mode routes escape, enter and arrows, leaving typing to the input", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ filtering: "left" })
		behaviors.keys(null, data, { name: "escape" })
		behaviors.keys(null, data, { name: "return" })
		behaviors.keys(null, data, { name: "tab" })
		behaviors.keys(null, data, { name: "tab", shift: true })
		behaviors.keys(null, data, { name: "up" })
		behaviors.keys(null, data, { name: "down" })
		behaviors.keys(null, data, { name: "x" })
		behaviors.keys(null, data, { name: "t" })
		expect(calls).toEqual([
			{ id: "filter.clear", payload: undefined },
			{ id: "filter.accept", payload: undefined },
			{ id: "filter.accept", payload: undefined },
			{ id: "pane.toggle", payload: undefined },
			{ id: "nav.up", payload: undefined },
			{ id: "nav.down", payload: undefined },
		])
	})

	test("escape clears an applied filter on the active pane", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ leftFilter: "not" })
		behaviors.keys(null, data, { name: "escape" })
		expect(calls).toEqual([{ id: "filter.clear", payload: undefined }])
	})

	test("palette mode publishes confirm with the query", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const calls = []
		const self = { pub: (name, payload) => calls.push({ id: name, payload }) }
		behaviors.keys(self, makeData({ paletteOpen: true, paletteQuery: "sw" }).data, { name: "return" })
		expect(calls).toEqual([{ id: "palette:confirm", payload: "sw" }])
	})

	test("confirm mode routes y/enter to confirm.yes and n/esc to confirm.no", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ confirm: { text: "erase?" } })
		behaviors.keys(null, data, { name: "y" })
		behaviors.keys(null, data, { name: "n" })
		behaviors.keys(null, data, { name: "escape" })
		behaviors.keys(null, data, { name: "down" })
		expect(calls).toEqual([
			{ id: "confirm.yes", payload: undefined },
			{ id: "confirm.no", payload: undefined },
			{ id: "confirm.no", payload: undefined },
		])
	})

	test("events map published payloads to dispatch", () => {
		const events = createEvents()
		const { calls, data } = makeData()
		events["crumbs:go"](null, data, { data: { path: "/tmp", paneId: "left" } })
		events["list:select"](null, data, { data: { paneId: "left", index: 2 } })
		events["commandbar:run"](null, data, { data: "pane.reload" })
		events["commandbar:run"](null, data, { data: null })
		events["palette:run"](null, data, { data: "view.togglePreview" })
		events["tabs:new"](null, data, { data: { paneId: "left" } })
		events["tabs:select"](null, data, { data: { paneId: "left", index: 1 } })
		events["pane:activate"](null, data, { data: "right" })
		expect(calls.map((call) => call.id)).toEqual([
			"pane.setPath",
			"list.cursor",
			"pane.reload",
			"view.togglePreview",
			"palette.toggle",
			"tab.new",
			"tab.select",
			"pane.activate",
		])
	})

	test("palette:confirm runs the selected item and closes", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			paletteIndex: 1,
			paletteItems: [
				{ id: "pane.toggle", title: "Switch" },
				{ id: "view.togglePreview", title: "Preview" },
			],
			paletteOpen: true,
		})
		events["palette:confirm"](null, data, { data: "sw" })
		expect(calls).toEqual([
			{ id: "view.togglePreview", payload: undefined },
			{ id: "palette.toggle", payload: undefined },
		])
	})

	test("palette:confirm submits the line in scripting mode", () => {
		const events = createEvents()
		const { calls, data } = makeData({ paletteMode: "script", paletteOpen: true })
		events["palette:confirm"](null, data, { data: "stat ." })
		expect(calls).toEqual([{ id: "palette.submit", payload: undefined }])
	})

	test("palette:run completes script rows instead of dispatching them", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			paletteItems: [{ id: "op:copy", title: "copy", completion: "copy " }],
			paletteMode: "script",
			paletteOpen: true,
		})
		events["palette:run"](null, data, { data: "op:copy" })
		expect(calls).toEqual([{ id: "palette.setQuery", payload: { query: "copy " } }])
	})
})
