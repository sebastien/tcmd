import { describe, expect, test } from "bun:test"
import { createBehaviors, createEvents, createInit } from "../../src/js/tcmd/components/App.js"

function makeData(overrides = {}) {
	const calls = []
	return {
		calls,
		data: {
			active: "left",
			dispatch: (id, payload) => calls.push({ id, payload }),
			leftError: null,
			paletteItems: [],
			paletteOpen: false,
			paletteQuery: "",
			rightError: null,
			...overrides,
		},
	}
}

describe("App", () => {
	test("init exposes session cells and pane ids", () => {
		const left = { cursor: "lc", disk: "ld", entries: "le", error: "lerr", marked: "lm", segments: "ls" }
		const right = {
			cursor: "rc",
			disk: "rd",
			entries: "re",
			error: "rerr",
			marked: "rm",
			segments: "rs",
		}
		const session = {
			active: "active",
			toolbarCommands: "commands",
			dispatch: "dispatch",
			paletteIndex: "pi",
			paletteItems: "pit",
			paletteOpen: "po",
			paletteQuery: "pq",
			panes: { left, right },
			preview: "preview",
			showPreview: "showPreview",
		}
		expect(createInit(session)()).toMatchObject({
			active: "active",
			toolbarCommands: "commands",
			dispatch: "dispatch",
			leftCursor: "lc",
			leftId: "left",
			paletteItems: "pit",
			preview: "preview",
			rightCursor: "rc",
			rightId: "right",
			showPreview: "showPreview",
		})
	})

	test("status reports the first pane error", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		expect(behaviors.status(null, { leftError: null, rightError: null })).toBe("")
		expect(behaviors.status(null, { leftError: "left boom", rightError: "right boom" })).toBe(
			"error: left boom",
		)
		expect(behaviors.status(null, { leftError: null, rightError: "right boom" })).toBe(
			"error: right boom",
		)
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

	test("palette mode intercepts keys and publishes confirm", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ paletteOpen: true, paletteQuery: "sw" })
		const self = { pub: (name, payload) => calls.push({ id: name, payload }) }
		behaviors.keys(self, data, { name: "down" })
		expect(calls).toEqual([])
		behaviors.keys(self, data, { name: "escape" })
		expect(calls).toEqual([{ id: "palette.toggle", payload: undefined }])
		behaviors.keys(self, data, { name: "return" })
		expect(calls).toEqual([
			{ id: "palette.toggle", payload: undefined },
			{ id: "palette:confirm", payload: "sw" },
		])
	})

	test("events map published payloads to dispatch", () => {
		const events = createEvents()
		const { calls, data } = makeData()
		events["crumbs:go"](null, data, { data: { path: "/tmp", paneId: "left" } })
		events["list:select"](null, data, { data: { paneId: "left", index: 2 } })
		events["toolbar:run"](null, data, { data: "pane.reload" })
		events["palette:run"](null, data, { data: "view.togglePreview" })
		expect(calls.map((call) => call.id)).toEqual([
			"pane.setPath",
			"list.cursor",
			"pane.reload",
			"view.togglePreview",
			"palette.toggle",
		])
	})

	test("palette:confirm picks the typed match and closes", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			paletteItems: [{ id: "pane.toggle", title: "Switch" }],
			paletteOpen: true,
		})
		events["palette:confirm"](null, data, { data: "switch" })
		expect(calls).toEqual([
			{ id: "pane.toggle", payload: undefined },
			{ id: "palette.toggle", payload: undefined },
		])
	})
})
