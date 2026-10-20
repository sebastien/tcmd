import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/FilePicker.js"
import { createBehaviors as rowBehaviors } from "../../src/js/tcmd/components/FilePickerRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("FilePicker", () => {
	test("exposes the editable path and focuses it by default", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const data = { open: true, path: "/home/", focus: "path" }
		expect(behaviors.open(null, data)).toBe(true)
		expect(behaviors.pathFocused(null, data)).toBe(true)
		expect(behaviors.pathFocused(null, { ...data, focus: "rows" })).toBe(false)
		expect(behaviors.pathSign()).toBe("› ")
	})

	test("a parent row does not hide the no-matches state", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.empty(null, { open: true, rows: [{ type: "parent" }] })).toBe(true)
		expect(behaviors.empty(null, { open: true, rows: [{ type: "parent" }, { type: "entry" }] })).toBe(false)
		expect(behaviors.empty(null, { open: false, rows: [] })).toBe(false)
	})
})

describe("FilePickerRow", () => {
	test("renders the parent row without a slash or size", () => {
		const behaviors = rowBehaviors({ ...behaviorEnv, icons: true })
		const parent = { item: { name: "..", isDir: true, isParent: true }, key: "parent:/home" }
		expect(behaviors.rowName(null, parent)).toBe("..")
		expect(behaviors.rowSize(null, parent)).toBe("")
		expect(behaviors.rowType(null, parent)).toBe("parent")
		// Ordinary entries reuse the file-row shape (directory slash + size).
		expect(behaviors.rowName(null, { item: { name: "docs", isDir: true } })).toBe("docs/")
		expect(behaviors.rowSize(null, { item: { name: "docs", isDir: true } })).toBe("<dir>")
		expect(behaviors.rowSize(null, { item: { name: "notes.txt", size: 5 } })).toBe("5B")
	})
})
