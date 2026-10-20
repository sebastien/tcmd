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
			bookmarkOpen: false,
			bookmarkQuery: "",
			confirm: null,
			dispatch: (id, payload) => calls.push({ id, payload }),
			filtering: null,
			leftError: null,
			leftFilter: null,
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
			bookmarkOpen: "bo",
			bookmarkQuery: "bq",
			commandBarItems: "barItems",
			confirm: "confirm",
			dispatch: "dispatch",
			filtering: "filtering",
			host: "test-host",
			notice: "notice",
			panelCommand: "pc",
			panelCursorRow: "pcr",
			panelDraft: "pd",
			panelEntry: "pentry",
			panelFiltered: "pfil",
			panelFocus: "pf",
			panelOpIndex: "pix",
			panelItems: "pitems",
			panelOpen: "pop",
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
			commandBarItems: "barItems",
			confirm: "confirm",
			dispatch: "dispatch",
			filtering: "filtering",
			leftCursor: "lc",
			leftFilter: "lf",
			leftId: "left",
			notice: "notice",
			panelEntry: "pentry",
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

	test("shift-tab reaches the keymap outside the panel", () => {
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

	test("the viewer overlay owns the keyboard while open", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ viewerOpen: true, active: "left" })
		behaviors.keys(null, data, { name: "escape" })
		behaviors.keys(null, data, { name: "v" })
		// ⇧V does not close the overlay (it would maximize the column).
		behaviors.keys(null, data, { name: "v", shift: true })
		behaviors.keys(null, data, { name: "o", shift: true })
		behaviors.keys(null, data, { name: "e", shift: true })
		// Everything else is swallowed, the workspace never sees it.
		behaviors.keys(null, data, { name: "down" })
		expect(calls).toEqual([
			{ id: "view.toggleViewer", payload: undefined },
			{ id: "view.toggleViewer", payload: undefined },
			{ id: "file.open", payload: { paneId: "left" } },
			{ id: "file.edit", payload: { paneId: "left" } },
		])
	})

	test("below the inline breakpoint v opens the viewer overlay", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const narrow = makeData({ uiSize: { width: 80, height: 20 } })
		behaviors.keys(null, narrow.data, { name: "v" })
		expect(narrow.calls).toEqual([{ id: "view.toggleViewer", payload: undefined }])
		// At the inline width the keymap's `view.togglePreview` wins instead.
		const wide = makeData({ uiSize: { width: 120, height: 20 } })
		behaviors.keys(null, wide.data, { name: "v" })
		expect(wide.calls).toEqual([{ id: "view.togglePreview", payload: { paneId: "left" } }])
	})

	test("the command bar's Preview opens the viewer below the breakpoint", () => {
		const events = createEvents()
		const narrow = makeData({ uiSize: { width: 80, height: 20 } })
		events["commandbar:run"](null, narrow.data, { data: "view.togglePreview" })
		expect(narrow.calls).toEqual([{ id: "view.toggleViewer", payload: undefined }])
		// Above the breakpoint the bar entry reaches the real command.
		const wide = makeData({ uiSize: { width: 120, height: 20 } })
		events["commandbar:run"](null, wide.data, { data: "view.togglePreview" })
		expect(wide.calls).toEqual([{ id: "view.togglePreview", payload: undefined }])
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
		events["pane:activate"](null, data, { data: "right" })
		events["view:toggleMode"](null, data, {})
		expect(calls.map((call) => call.id)).toEqual([
			"pane.setPath",
			"list.cursor",
			"pane.reload",
			"pane.activate",
			"view.toggleMode",
		])
	})

	test("a double click on the same row opens it like Enter", () => {
		const events = createEvents()
		const { calls, data } = makeData()
		// First click: select only.
		events["list:select"](null, data, { data: { paneId: "left", index: 2 } })
		expect(calls).toEqual([{ id: "list.cursor", payload: { paneId: "left", index: 2 } }])
		// Same row again, right away: select (idempotent) then open.
		events["list:select"](null, data, { data: { paneId: "left", index: 2 } })
		expect(calls.slice(1)).toEqual([
			{ id: "list.cursor", payload: { paneId: "left", index: 2 } },
			{ id: "pane.enter", payload: { paneId: "left" } },
		])
	})

	test("a second click on a different row only selects", () => {
		const events = createEvents()
		const { calls, data } = makeData()
		events["list:select"](null, data, { data: { paneId: "left", index: 2 } })
		events["list:select"](null, data, { data: { paneId: "left", index: 3 } })
		events["list:select"](null, data, { data: { paneId: "right", index: 3 } })
		expect(calls.map((call) => call.id)).toEqual(["list.cursor", "list.cursor", "list.cursor"])
	})

	test("bookmark events select by item key and confirm activates", () => {
		const events = createEvents()
		const { calls, data } = makeData({
			bookmarkItems: [
				{ key: "+ add current path", add: true, name: "", path: "/home/notes.txt" },
				{ key: "notes", name: "notes", path: "/home/notes.txt" },
			],
			bookmarkOpen: true,
		})
		events["bookmark:select"](null, data, { data: "+ add current path" })
		expect(calls).toEqual([
			{ id: "bookmark.setIndex", payload: { index: 0 } },
			{ id: "bookmark.select", payload: undefined },
		])

		const listing = makeData({ bookmarkOpen: true })
		events["bookmark:confirm"](null, listing.data, {})
		expect(listing.calls).toEqual([{ id: "bookmark.select", payload: undefined }])
	})

	test("the bookmark panel routes navigation, removal and activation", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const listing = makeData({ bookmarkOpen: true, bookmarkQuery: "" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "down" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "up" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "backspace" })
		behaviors.keys({ pub: () => {} }, listing.data, { name: "delete" })
		expect(listing.calls).toEqual([
			{ id: "bookmark.down", payload: undefined },
			{ id: "bookmark.up", payload: undefined },
			{ id: "bookmark.remove", payload: undefined },
			{ id: "bookmark.remove", payload: undefined },
		])

		// With text in the filter, Backspace belongs to the input; Delete still
		// removes, and Enter publishing confirm is left to the input/keys.
		const editing = makeData({ bookmarkOpen: true, bookmarkQuery: "note" })
		behaviors.keys({ pub: () => {} }, editing.data, { name: "backspace" })
		expect(editing.calls).toEqual([])
		behaviors.keys({ pub: () => {} }, editing.data, { name: "delete" })
		expect(editing.calls).toEqual([{ id: "bookmark.remove", payload: undefined }])
		behaviors.keys({ pub: (name) => editing.calls.push({ id: name }) }, editing.data, { name: "return" })
		expect(editing.calls).toContainEqual({ id: "bookmark:confirm" })

		const closing = makeData({ bookmarkOpen: true })
		behaviors.keys({ pub: () => {} }, closing.data, { name: "escape" })
		expect(closing.calls).toEqual([{ id: "bookmark.cancel", payload: undefined }])
	})

	test("the list overlay owns the keyboard while open", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ overlay: "history" })
		behaviors.keys(null, data, { name: "up" })
		behaviors.keys(null, data, { name: "down" })
		behaviors.keys(null, data, { name: "return" })
		// The opening key closes, as do Esc and any unhandled key (swallowed).
		behaviors.keys(null, data, { name: "u" })
		behaviors.keys(null, data, { name: "escape" })
		behaviors.keys(null, data, { name: "x" })
		expect(calls).toEqual([
			{ id: "overlay.up", payload: undefined },
			{ id: "overlay.down", payload: undefined },
			{ id: "overlay.activate", payload: undefined },
			{ id: "overlay.cancel", payload: undefined },
			{ id: "overlay.cancel", payload: undefined },
		])
		// Shift-T closes the trash overlay.
		const trash = makeData({ overlay: "trash" })
		behaviors.keys(null, trash.data, { name: "t", shift: true })
		expect(trash.calls).toEqual([{ id: "overlay.cancel", payload: undefined }])
	})

	test("overlay events select and activate a clicked row", () => {
		const events = createEvents()
		const { calls, data } = makeData({ overlay: "trash", overlayItems: [{ key: "/t/a" }] })
		events["overlay:select"](null, data, { data: "/t/a" })
		events["overlay:select"](null, data, { data: "nope" })
		expect(calls).toEqual([
			{ id: "overlay.setIndex", payload: { index: 0 } },
			{ id: "overlay.activate", payload: undefined },
		])
	})

	test("panel mode navigates operations and arguments by focus", () => {
		const behaviors = createBehaviors({ quit: () => {} })
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

	test("panel Enter asks to run, from any focus", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		// Enter always asks the panel to run; `panel.run` then runs a complete
		// command or walks to the missing field. No input owns Enter itself.
		for (const focus of ["ops", "field", "args"]) {
			const { calls, data } = makeData({ panelFocus: focus, panelOpen: true })
			behaviors.keys(null, data, { name: "return" })
			expect(calls).toEqual([{ id: "panel.run", payload: undefined }])
		}
	})

	test("a textual argument hands typing and editing to its value input", () => {
		const behaviors = createBehaviors({ quit: () => {} })
		const { calls, data } = makeData({ panelFocus: "args", panelOpen: true, panelTextual: true })
		// Letters, Backspace and caret movement are left to the input (Enter is
		// routed to `panel.run` by the root); the regression guard: Backspace
		// used to bounce the cursor back to the filter mid-edit.
		behaviors.keys(null, data, { name: "x" })
		behaviors.keys(null, data, { name: "backspace" })
		behaviors.keys(null, data, { name: "left" })
		behaviors.keys(null, data, { name: "right" })
		behaviors.keys(null, data, { name: "home" })
		behaviors.keys(null, data, { name: "end" })
		expect(calls).toEqual([])
		// From a non-textual argument row, arrows move the pane cursor.
		const context = makeData({ panelFocus: "args", panelOpen: true, panelTextual: false })
		behaviors.keys(null, context.data, { name: "down" })
		behaviors.keys(null, context.data, { name: "up" })
		expect(context.calls).toEqual([
			{ id: "panel.nextArg", payload: undefined },
			{ id: "panel.prevArg", payload: undefined },
		])
	})

	test("typing on a non-textual argument returns to the command filter", () => {
		const behaviors = createBehaviors({ quit: () => {} })
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
			panelItems: [
				{ type: "group", key: "group:file", name: "File", group: "File" },
				{ type: "op", key: "op:copy", entryIndex: 0, name: "copy" },
			],
			panelRows: [
				{ key: "arg:0", type: "arg" },
				{ key: "item:0:/a", type: "item" },
				{ key: "arg:readonly", type: "arg", readonly: true, summary: "/home/notes.txt" },
				{ key: "panel:run", type: "run" },
			],
		})
		// A group header click is inert.
		events["panel:select"](null, data, { data: "group:file" })
		events["panel:select"](null, data, { data: "op:copy" })
		events["panel:select"](null, data, { data: "item:0:/a" })
		// A read-only value copies before the row takes focus.
		events["panel:select"](null, data, { data: "arg:readonly" })
		events["panel:select"](null, data, { data: "panel:run" })
		events["panel:confirm"](null, data, {})
		expect(calls).toEqual([
			{ id: "panel.setOp", payload: { index: 0 } },
			{ id: "panel.focusArg", payload: undefined },
			{ id: "panel.setRow", payload: { index: 1 } },
			{ id: "panel.toggleItem", payload: undefined },
			{ id: "panel.focusArg", payload: undefined },
			{ id: "panel.setRow", payload: { index: 2 } },
			{ id: "panel.copy", payload: { text: "/home/notes.txt" } },
			{ id: "panel.focusArg", payload: undefined },
			{ id: "panel.setRow", payload: { index: 3 } },
			{ id: "panel.run", payload: undefined },
			{ id: "panel.run", payload: undefined },
		])
	})
})
