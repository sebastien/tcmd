import { describe, expect, test } from "bun:test"
import {
	createBehaviors,
	isFocused,
	riskFg,
	rowName,
	rowSummary,
	selectStem,
	stemEnd,
	wantsFocus,
} from "../../src/js/tcmd/components/CommandArgRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandArgRow", () => {
	test("names operation, argument and item rows", () => {
		expect(rowName({ type: "op", name: "copy" })).toBe("copy")
		expect(rowName({ type: "arg", name: "FROM" })).toBe("FROM")
		expect(rowName({ type: "item", marker: "[x]", name: "notes.txt" })).toBe("[x] notes.txt")
		expect(rowName({ type: "item", marker: "[ ]", name: "docs" })).toBe("[ ] docs")
		// A group header carries its category name; a picker entry a directory slash.
		expect(rowName({ type: "group", name: "Command" })).toBe("Command")
		expect(rowName({ type: "run", name: "Run" })).toBe("[Run]")
		expect(rowName({ type: "entry", name: "docs", isDir: true })).toBe("docs/")
	})

	test("group headers take no cursor and use the category color", () => {
		expect(wantsFocus({ type: "group" })).toBe("none")
		expect(isFocused({ type: "group" }, 0, 0, "ops")).toBe(false)
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowFg(null, { row: { type: "group", name: "Command", group: "Command" }, index: 0 })).toBe("text")
		expect(behaviors.rowFg(null, { row: { type: "group", name: "Edit", group: "Edit" }, index: 0 })).toBe("warning")
		expect(behaviors.rowFg(null, { row: { type: "group", name: "Delete", group: "Delete" }, index: 0 })).toBe("error")
	})

	test("stacks an argument label over its value and frames a selection's list", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// The label owns its own line; the value lines up under it.
		expect(behaviors.name(null, { row: { type: "arg", name: "FIND" } })).toBe("FIND")
		expect(behaviors.rowHeight(null, { row: { type: "arg" } })).toBe(2)
		expect(behaviors.rowHeight(null, { row: { type: "item" } })).toBe(1)
		expect(behaviors.rowHeight(null, { row: { type: "op" } })).toBe(1)
		// A frame row takes no cursor and draws the list's top/bottom.
		expect(wantsFocus({ type: "frame" })).toBe("none")
		expect(isFocused({ type: "frame" }, 0, 0, "args")).toBe(false)
		expect(behaviors.listBorder(null, { row: { type: "frame", variant: "top" } })).toEqual([
			"top",
			"left",
			"right",
		])
		expect(behaviors.listBorder(null, { row: { type: "frame", variant: "bottom" } })).toEqual([
			"bottom",
			"left",
			"right",
		])
		// An item row draws the sides; the list indents under the value
		// (marker + gap).
		expect(behaviors.listBorder(null, { row: { type: "item" } })).toEqual(["left", "right"])
		expect(behaviors.rowIndent(null, { row: { type: "item" } })).toBe(1)
		expect(behaviors.listSpacer(null, {})).toBe("\u00a0")
		expect(behaviors.rowIndent(null, { row: { type: "arg" } })).toBe(0)
	})

	test("adds a third line for a rename diff", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const row = {
			type: "arg",
			diff: { unchanged: false, prefix: "notes", suffix: ".txt", fromChanged: "2", toChanged: "3" },
		}
		expect(behaviors.rowHeight(null, { row })).toBe(3)
		expect(behaviors.hasDiff(null, { row })).toBe(true)
		expect(behaviors.diffChanged(null, { row })).toBe(true)
		expect(behaviors.diffUnchanged(null, { row })).toBe(false)
		expect(behaviors.diffFromPrefix(null, { row })).toBe("notes")
		expect(behaviors.diffFromChanged(null, { row })).toBe("2")
		expect(behaviors.diffFromSuffix(null, { row })).toBe(".txt")
		expect(behaviors.diffToPrefix(null, { row })).toBe("notes")
		expect(behaviors.diffToChanged(null, { row })).toBe("3")
		expect(behaviors.diffToSuffix(null, { row })).toBe(".txt")
		expect(behaviors.diffArrow()).toBe(" → ")
		expect(behaviors.diffDimFg()).toBe("dim")
		expect(behaviors.diffRemovedFg()).toBe("warning")
		expect(behaviors.diffAddedFg()).toBe("mark")
		// An unchanged row still gets the line, but shows a single label.
		const unchanged = {
			type: "arg",
			diff: { unchanged: true, prefix: "notes.txt", suffix: "", fromChanged: "", toChanged: "" },
		}
		expect(behaviors.rowHeight(null, { row: unchanged })).toBe(3)
		expect(behaviors.diffChanged(null, { row: unchanged })).toBe(false)
		expect(behaviors.diffUnchanged(null, { row: unchanged })).toBe(true)
		expect(behaviors.diffUnchangedText()).toBe("(unchanged)")
		// A plain argument keeps its two lines.
		expect(behaviors.hasDiff(null, { row: { type: "arg" } })).toBe(false)
	})

	test("selects the rename stem when TO still matches FROM", () => {
		expect(stemEnd("notes.txt")).toBe(5)
		expect(stemEnd("archive.tar.gz")).toBe(11)
		expect(stemEnd("README")).toBe(6)
		// A dotfile has no extension to preserve.
		expect(stemEnd(".gitignore")).toBe(10)

		const selected = []
		const input = { value: "notes.txt", setSelectionRange: (start, end) => selected.push([start, end]) }
		const row = { type: "arg", selectStem: true, diff: { unchanged: true } }
		selectStem(null, { row, value: "notes.txt" }, { target: input })
		expect(selected).toEqual([[0, 5]])
		// A changed name is left alone, as is a row that does not opt in.
		selectStem(null, { row: { ...row, diff: { unchanged: false } }, value: "memo.txt" }, { target: input })
		selectStem(null, { row: { ...row, selectStem: false } }, { target: input })
		expect(selected).toEqual([[0, 5]])
		// The TUI input takes its value from the row ref and uses setSelection.
		const tui = []
		const self = {
			ref: { valueInput: { value: "notes.txt", setSelection: (start, end) => tui.push([start, end]) } },
		}
		selectStem(self, { row, value: "notes.txt" }, {})
		expect(tui).toEqual([[0, 5]])
	})

	test("renders permission class rows with a bit cursor", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const row = {
			type: "perm",
			label: "user",
			bits: [
				{ id: "r", selected: true },
				{ id: "w", selected: false },
				{ id: "x", selected: true },
			],
		}
		expect(rowName(row)).toBe("user")
		expect(behaviors.isPerm(null, { row })).toBe(true)
		expect(behaviors.permClass(null, { row })).toBe("user")
		expect(behaviors.permR(null, { row })).toBe("r")
		expect(behaviors.permW(null, { row })).toBe("-")
		expect(behaviors.permX(null, { row })).toBe("x")
		expect(behaviors.permXOn(null, { row })).toBe("true")
		expect(behaviors.permWOn(null, { row })).toBe("false")
		// Enabled bits use the secondary accent; the cursor bit is highlighted.
		expect(behaviors.permRFg(null, { row })).toBe("mark")
		expect(behaviors.permWFg(null, { row })).toBe("dim")
		const focused = { row, index: 1, cursor: 1, focus: "args", permBit: 2 }
		expect(behaviors.permXBg(null, focused)).toBe("accentSecondaryBg")
		expect(behaviors.permRBg(null, focused)).toBeUndefined()
		expect(behaviors.permXClass(null, focused)).toBe("is-on is-bit-focused")
	})

	test("summarises headers and shows an item's parent", () => {
		expect(rowSummary({ type: "op", summary: "FROM TO" })).toBe("FROM TO")
		expect(rowSummary({ type: "arg", summary: "/tmp" })).toBe("/tmp")
		expect(rowSummary({ type: "item", parent: "/home" })).toBe("/home")
		expect(rowSummary({ type: "item" })).toBe("")
	})

	test("maps a row to its column focus token", () => {
		expect(wantsFocus({ type: "op" })).toBe("ops")
		expect(wantsFocus({ type: "arg" })).toBe("args")
		expect(wantsFocus({ type: "item" })).toBe("args")
		expect(wantsFocus({ type: "run" })).toBe("args")
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.isOp(null, { row: { type: "op" } })).toBe(true)
		expect(behaviors.isOp(null, { row: { type: "arg" } })).toBe(false)
		expect(behaviors.isGroup(null, { row: { type: "group" } })).toBe(true)
		expect(behaviors.isEntry(null, { row: { type: "entry" } })).toBe(true)
		expect(behaviors.isRun(null, { row: { type: "run" } })).toBe(true)
		expect(behaviors.runLabel()).toBe("[Run]")
		expect(behaviors.runLabel(null, { row: { type: "run", error: "failed" } })).toBe("[Retry]")
		expect(behaviors.runLabel(null, { row: { type: "run", armed: true } })).toBe("[Confirm]")
		expect(behaviors.runAriaLabel(null, { row: { type: "run", armed: true } })).toBe("Confirm command")
		expect(rowName({ type: "run", armed: true })).toBe("[Confirm]")
		expect(behaviors.runMarginTop(null, { row: { type: "run" } })).toBe(1)
		expect(behaviors.runMarginTop(null, { row: { type: "arg" } })).toBe(0)
		expect(behaviors.runError(null, { row: { type: "run", error: "failed" } })).toBe("failed")
		expect(behaviors.fieldOpen(null, { row: { type: "arg", textual: true } })).toBe("[")
		expect(behaviors.fieldOpen(null, { row: { type: "arg", textual: false } })).toBe("")
		expect(behaviors.groupAttributes()).toBe(0)
	})

	test("focus requires the right column and index", () => {
		expect(isFocused({ type: "op" }, 1, 1, "ops")).toBe(true)
		expect(isFocused({ type: "op" }, 1, 1, "args")).toBe(false)
		expect(isFocused({ type: "arg" }, 1, 1, "args")).toBe(true)
		expect(isFocused({ type: "arg" }, 1, 0, "args")).toBe(false)
	})

	test("exposes markers, row colors and the focused class", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, focusedClass: "is-focused" })
		expect(behaviors.marker(null, { row: { type: "arg" }, index: 0, cursor: 0, focus: "args" })).toBe(">")
		expect(behaviors.marker(null, { row: { type: "arg" }, index: 1, cursor: 0, focus: "args" })).toBe(" ")
		expect(behaviors.rowClass(null, { row: { type: "op" }, index: 0, cursor: 0, focus: "ops" })).toBe("is-focused")
		expect(behaviors.rowBg(null, { row: { type: "op" }, index: 0, cursor: 0, focus: "ops" })).toBe("selected")
		// A selected item reads in the mark colour when it is not focused.
		expect(
			behaviors.rowFg(null, { row: { type: "item", selected: true }, index: 5, cursor: 0, focus: "args" }),
		).toBe("mark")
	})

	test("tints risky operations red (destructive) and amber (caution)", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// delete/erase are destructive -> error colour (also while focused).
		expect(behaviors.rowFg(null, { row: { type: "op", risk: "destructive" }, index: 0, cursor: 2, focus: "ops" })).toBe(
			"error",
		)
		expect(behaviors.rowFg(null, { row: { type: "op", risk: "destructive" }, index: 0, cursor: 0, focus: "ops" })).toBe(
			"error",
		)
		// move is a caution -> warning colour.
		expect(behaviors.rowFg(null, { row: { type: "op", risk: "caution" }, index: 0, cursor: 2, focus: "ops" })).toBe(
			"warning",
		)
		// A non-risky op keeps the text colour (accent when focused).
		expect(behaviors.rowFg(null, { row: { type: "op", risk: null }, index: 0, cursor: 2, focus: "ops" })).toBe("text")
		expect(behaviors.rowFg(null, { row: { type: "op", risk: null }, index: 0, cursor: 0, focus: "ops" })).toBe("accent")
		expect(riskFg({ type: "op", risk: "destructive" }, behaviorEnv)).toBe("error")
		expect(riskFg({ type: "op", risk: "caution" }, behaviorEnv)).toBe("warning")
		expect(riskFg({ type: "item", risk: "destructive" }, behaviorEnv)).toBeNull()
	})
})
