import { describe, expect, test } from "bun:test"
import {
	commandBarFit,
	commandBarMarks,
	commandBarMarksItem,
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

	test("the marked count follows the focused listing", () => {
		const focusedMarked = new Set(["a", "b"])
		expect(commandBarMarksItem({ active: "left", focusedMarked })).toEqual({
			id: null,
			title: "2 marked",
			dim: true,
		})
		// A file card in a full view has no listing to mark; a directory
		// column keeps its count in both full views.
		expect(commandBarMarksItem({ focusedMarked, viewerOpen: true })).toBeNull()
		expect(commandBarMarksItem({ focusedMarked, previewFull: true, previewDirectory: false })).toBeNull()
		expect(commandBarMarksItem({ focusedMarked, previewFull: true, previewDirectory: true })).toEqual({
			id: null,
			title: "2 marked",
			dim: true,
		})
		expect(commandBarMarksItem({ focusedMarked, viewerOpen: true, previewDirectory: true })).toEqual({
			id: null,
			title: "2 marked",
			dim: true,
		})
	})

	test("fits entries on one line, appending an ellipsis when they do not", () => {
		const items = [
			{ id: "a", title: "Open", keys: "Enter" },
			{ id: "b", title: "Parent", keys: "←" },
			{ id: "c", title: "Bookmark", keys: "b" },
		]
		// Everything fits when the width allows it: no marker.
		expect(commandBarFit(items, 80)).toEqual(items)
		// "[Open ⏎] " is 9 columns, "[Parent ←] " 11, "[Bookmark b] " 13:
		// 33 columns hold all three exactly.
		expect(commandBarFit(items, 33)).toEqual(items)
		// 32 columns still hold Open and Parent, with room for the marker.
		expect(commandBarFit(items, 32)).toEqual([
			...items.slice(0, 2),
			{ id: null, title: "…", dim: true },
		])
		// At 21 columns the marker's two columns push Parent off the line.
		expect(commandBarFit(items, 21)).toEqual([items[0], { id: null, title: "…", dim: true }])
		// At 12 columns the first entry still fits, so only the marker remains.
		expect(commandBarFit(items, 12)).toEqual([items[0], { id: null, title: "…", dim: true }])
		// Too narrow for even the first entry: the marker alone.
		expect(commandBarFit(items, 8)).toEqual([{ id: null, title: "…", dim: true }])
		// Unknown width keeps everything for the renderer to clip.
		expect(commandBarFit(items, 0)).toEqual(items)
		expect(commandBarFit(null, 40)).toEqual([])
	})
})
