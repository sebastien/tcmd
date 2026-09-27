import { describe, expect, test } from "bun:test"
import { clampCursor, currentEntry, moveCursor, toggleMark } from "../../src/js/tcmd/core/selection.js"

describe("selection", () => {
	test("clamps the cursor to the list bounds", () => {
		expect(clampCursor(3, 0)).toBe(0)
		expect(clampCursor(-2, 5)).toBe(0)
		expect(clampCursor(9, 5)).toBe(4)
		expect(clampCursor(2, 5)).toBe(2)
	})

	test("moves the cursor by a delta within the bounds", () => {
		expect(moveCursor(0, 1, 3)).toBe(1)
		expect(moveCursor(2, 1, 3)).toBe(2)
		expect(moveCursor(0, -1, 3)).toBe(0)
	})

	test("returns the entry under the cursor", () => {
		const entries = [{ name: "a" }, { name: "b" }]
		expect(currentEntry(entries, 1)).toEqual({ name: "b" })
		expect(currentEntry(entries, 9)).toBeUndefined()
	})

	test("toggles a path in a new mark set", () => {
		const marks = new Set(["/a"])
		const added = toggleMark(marks, "/b")
		expect([...added]).toEqual(["/a", "/b"])
		expect([...marks]).toEqual(["/a"])
		const removed = toggleMark(added, "/a")
		expect([...removed]).toEqual(["/b"])
	})
})
