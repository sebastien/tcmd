import { describe, expect, test } from "bun:test"
import {
	createBehaviors,
	isFocused,
	riskFg,
	rowName,
	rowSummary,
	wantsFocus,
} from "../../src/js/tcmd/components/CommandArgRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandArgRow", () => {
	test("names operation, argument and item rows", () => {
		expect(rowName({ type: "op", name: "copy" })).toBe("copy")
		expect(rowName({ type: "arg", name: "FROM" })).toBe("FROM")
		expect(rowName({ type: "item", marker: "[x]", name: "notes.txt" })).toBe("[x] notes.txt")
		expect(rowName({ type: "item", marker: "[ ]", name: "docs" })).toBe("[ ] docs")
		// A group header carries its label; a picker entry a directory slash.
		expect(rowName({ type: "group", name: "System" })).toBe("System")
		expect(rowName({ type: "entry", name: "docs", isDir: true })).toBe("docs/")
	})

	test("group headers take no cursor and read as headings", () => {
		expect(wantsFocus({ type: "group" })).toBe("none")
		expect(isFocused({ type: "group" }, 0, 0, "ops")).toBe(false)
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowFg(null, { row: { type: "group", name: "System" }, index: 0 })).toBe("title")
	})

	test("pads an argument label and frames a selection's list", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// The argument label is padded to the value column.
		expect(behaviors.name(null, { row: { type: "arg", name: "FIND" }, labelWidth: 7 })).toBe("FIND   ")
		// A frame row takes no cursor and draws the list's top/bottom.
		expect(wantsFocus({ type: "frame" })).toBe("none")
		expect(isFocused({ type: "frame" }, 0, 0, "args")).toBe(false)
		expect(behaviors.listBorder(null, { row: { type: "frame", variant: "top" }, labelWidth: 7 })).toEqual([
			"top",
			"left",
			"right",
		])
		expect(behaviors.listBorder(null, { row: { type: "frame", variant: "bottom" } })).toEqual([
			"bottom",
			"left",
			"right",
		])
		// An item row draws the sides; the list indents under the value column
		// (marker + gap + label + gap).
		expect(behaviors.listBorder(null, { row: { type: "item" } })).toEqual(["left", "right"])
		expect(behaviors.rowIndent(null, { row: { type: "item" }, labelWidth: 7 })).toBe(11)
		expect(behaviors.listSpacer(null, { labelWidth: 7 })).toBe("\u00a0".repeat(11))
		expect(behaviors.rowIndent(null, { row: { type: "arg" }, labelWidth: 7 })).toBe(0)
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
