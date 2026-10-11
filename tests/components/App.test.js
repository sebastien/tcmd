import { describe, expect, test } from "bun:test"
import { createBehaviors, createEvents, createInit } from "../../src/js/tcmd/components/App.js"

function makeData(overrides = {}) {
	const calls = []
	return {
		calls,
		data: {
			active: "left",
			bookmarkIndex: 0,
			bookmarkItems: [],
			bookmarkMode: "list",
			bookmarkOpen: false,
			bookmarkQuery: "",
			bookmarkTarget: null,
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
			panelCommand: "",
			panelFocus: "ops",
			panelOpIndex: 0,
			panelItems: [],
			panelOpen: false,
			panelQuery: "",
			panelRows: [],
			panelRunnable: true,
			panelTextual: false,
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
			bookmarkIndex: "bi",
			bookmarkItems: "bits",
			bookmarkMode: "bm",
			bookmarkOpen: "bo",
			bookmarkQuery: "bq",
			bookmarkTarget: "bt",
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
			panelCommand: "pc",
			panelCursorRow: "pcr",
			panelDraft: "pd",
			panelFiltered: "pfil",
			panelFocus: "pf",
			panelOpIndex: "pix",
			panelItems: "pitems",
			panelOpen: "pop",
			panelOperation: "poper",
			panelQuery: "pq2",
			panelRowIndex: "pr",
			panelRows: "prs",
			panelRunnable: "prun",
			panelTextual: "pt",
			panelValue: "pv",
			panes: { left, right },
			preview: "preview",
			showPreview: "showPreview",
		}
		expect(createInit(session)()).toMatchObject({
			active: "active",
			appHost: "test-host",
			appPath: "ap",
			bookmarkItems: "bits",
			bookmarkMode: "bm",
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
			panelItems: "pitems",
			panelQuery: "pq2",
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

	test("escape without a filter reaches the keymap as pane.back", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData()
		behaviors.keys(null, data, { name: "escape" })
		expect(calls).toEqual([{ id: "pane.back", payload: { paneId: "left" } }])
	})

	test("shift-escape reaches the keymap as pane.forward, even with a filter", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ leftFilter: "not" })
		behaviors.keys(null, data, { name: "escape", shift: true })
		expect(calls).toEqual([{ id: "pane.forward", payload: { paneId: "left" } }])
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
		events["pane:activate"](null, data, { data: "right" })
		expect(calls.map((call) => call.id)).toEqual([
			"pane.setPath",
			"list.cursor",
			"pane.reload",
			"view.togglePreview",
			"palette.toggle",
			"pane.activate",
		])
	})

	test("bookmark events route to select, save and jump", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			bookmarkItems: [{ name: "notes", path: "/home/notes.txt" }],
			bookmarkOpen: true,
		})
		events["bookmark:select"](null, data, { data: "notes" })
		expect(calls).toEqual([
			{ id: "bookmark.setIndex", payload: { index: 0 } },
			{ id: "bookmark.select", payload: undefined },
		])

		const naming = makeData({ bookmarkOpen: true, bookmarkMode: "name" })
		events["bookmark:confirm"](null, naming.data, {})
		expect(naming.calls).toEqual([{ id: "bookmark.save", payload: undefined }])

		const listing = makeData({
			bookmarkOpen: true,
			bookmarkMode: "list",
			bookmarkItems: [{ name: "notes", path: "/home/notes.txt" }],
		})
		events["bookmark:confirm"](null, listing.data, {})
		expect(listing.calls).toEqual([{ id: "bookmark.select", payload: undefined }])
	})

	test("bookmark mode routes navigation, save and cancel", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		// Name mode: Enter publishes confirm, Esc cancels.
		const naming = makeData({ bookmarkOpen: true, bookmarkMode: "name" })
		behaviors.keys({ pub: () => {} }, naming.data, { name: "escape" })
		expect(naming.calls).toEqual([{ id: "bookmark.cancel", payload: undefined }])
		const namingSelf = { pub: (name) => naming.calls.push({ id: name }) }
		behaviors.keys(namingSelf, naming.data, { name: "return" })
		expect(naming.calls).toContainEqual({ id: "bookmark:confirm" })

		// List mode: arrows move, Enter jumps.
		const listing = makeData({ bookmarkOpen: true, bookmarkMode: "list" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "down" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "up" })
		expect(listing.calls).toEqual([
			{ id: "bookmark.down", payload: undefined },
			{ id: "bookmark.up", payload: undefined },
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

	test("panel mode navigates operations and arguments by focus", () => {
		const behaviors = createBehaviors({ panel: true, quit: () => {} })
		const ops = makeData({ panelOpen: true, panelFocus: "ops" })
		behaviors.keys(null, ops.data, { name: "down" })
		behaviors.keys(null, ops.data, { name: "up" })
		behaviors.keys(null, ops.data, { name: "tab" })
		behaviors.keys(null, ops.data, { name: "escape" })
		expect(ops.calls).toEqual([
			{ id: "panel.down", payload: undefined },
			{ id: "panel.up", payload: undefined },
			{ id: "panel.tab", payload: { delta: 1 } },
			{ id: "panel.cancel", payload: undefined },
		])
		// Shift-Tab walks the focus ring backwards.
		behaviors.keys(null, ops.data, { name: "tab", shift: true })
		expect(ops.calls[4]).toEqual({ id: "panel.tab", payload: { delta: -1 } })

		const args = makeData({ panelFocus: "args", panelOpen: true })
		behaviors.keys(null, args.data, { name: "down" })
		behaviors.keys(null, args.data, { name: "up" })
		behaviors.keys(null, args.data, { name: "space" })
		expect(args.calls).toEqual([
			{ id: "panel.nextArg", payload: undefined },
			{ id: "panel.prevArg", payload: undefined },
			{ id: "panel.toggleItem", payload: undefined },
		])
	})

	test("panel Enter runs the highlighted command from either column", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const ops = makeData({ panelFocus: "ops", panelOpIndex: 2, panelOpen: true })
		behaviors.keys(null, ops.data, { name: "return" })
		expect(ops.calls).toEqual([{ id: "panel.run", payload: undefined }])

		const args = makeData({ panelFocus: "args", panelOpen: true })
		behaviors.keys(null, args.data, { name: "return" })
		expect(args.calls).toEqual([{ id: "panel.run", payload: undefined }])
	})

	test("a textual argument hands typing and Enter to the field", () => {
		const behaviors = createBehaviors({ panel: true, quit: () => {} })
		const { calls, data } = makeData({ panelFocus: "args", panelOpen: true, panelTextual: true })
		// Letters and Enter are left to the input (its `on:enter` runs the
		// command); navigation still works.
		behaviors.keys(null, data, { name: "x" })
		behaviors.keys(null, data, { name: "return" })
		expect(calls).toEqual([])
		behaviors.keys(null, data, { name: "down" })
		expect(calls).toEqual([{ id: "panel.nextArg", payload: undefined }])
	})

	test("typing on a non-textual argument returns to the command filter", () => {
		const behaviors = createBehaviors({ panel: true, quit: () => {} })
		const { calls, data } = makeData({ panelFocus: "args", panelOpen: true, panelTextual: false })
		behaviors.keys(null, data, { name: "e" })
		behaviors.keys(null, data, { name: "backspace" })
		// Space toggles items rather than filtering while not textual.
		behaviors.keys(null, data, { name: "space" })
		expect(calls).toEqual([
			{ id: "panel.type", payload: { char: "e" } },
			{ id: "panel.type", payload: { backspace: true } },
			{ id: "panel.toggleItem", payload: undefined },
		])
	})

	test("panel events select operations and toggle items", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			panelOpen: true,
			panelItems: [{ id: "op:copy", title: "copy" }],
			panelRows: [
				{ key: "arg:0", type: "arg" },
				{ key: "item:0:/a", type: "item" },
			],
		})
		events["panel:select"](null, data, { data: "op:copy" })
		events["panel:select"](null, data, { data: "item:0:/a" })
		events["panel:confirm"](null, data, {})
		expect(calls).toEqual([
			{ id: "panel.setOp", payload: { index: 0 } },
			{ id: "panel.focusArg", payload: undefined },
			{ id: "panel.setRow", payload: { index: 1 } },
			{ id: "panel.toggleItem", payload: undefined },
			{ id: "panel.run", payload: undefined },
		])
	})
})
