import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors, isMarked, rowMarker, rowName, rowSize } from "../../src/js/tcmd/components/FileRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

const DIR = { isDir: true, name: "sub", path: "/sub", size: 0 }
const FILE = { isDir: false, name: "a.txt", path: "/a.txt", size: 10 }

describe("FileRow", () => {
	test("names, sizes and markers", () => {
		expect(rowName(DIR)).toBe("sub/")
		expect(rowSize(DIR)).toBe("<dir>")
		expect(rowName(FILE)).toBe("a.txt")
		expect(rowSize(FILE)).toBe("10B")
		expect(rowMarker(FILE, 0, 0, new Set())).toBe("> ")
		expect(rowMarker(FILE, 0, 1, new Set())).toBe("  ")
		expect(rowMarker(FILE, 1, 0, new Set(["/a.txt"]))).toBe("* ")
		expect(isMarked(FILE, new Set(["/a.txt"]))).toBe(true)
	})

	test("behaviors read plain cursor and marks", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowName(null, { item: DIR })).toBe("sub/")
		expect(behaviors.rowBg(null, { index: 1, cursor: 1 })).toBe("cursor")
		expect(behaviors.rowBg(null, { index: 0, cursor: 1 })).toBeUndefined()
		expect(behaviors.rowClass(null, { index: 1, cursor: 1 })).toBe("is-current")
		expect(behaviors.rowClass(null, { index: 0, cursor: 1 })).toBeNull()
		expect(behaviors.rowNameFg(null, { item: DIR })).toBe("dir")
		expect(behaviors.rowNameFg(null, { item: FILE })).toBe("text")
		expect(behaviors.rowNameClass(null, { item: DIR })).toBe("is-dir")
		expect(behaviors.rowNameClass(null, { item: FILE })).toBeNull()
		expect(behaviors.rowMarkerFg(null, { item: FILE, marked: new Set(["/a.txt"]) })).toBe("mark")
		expect(behaviors.rowMarkerFg(null, { item: FILE, marked: new Set() })).toBe("accent")
		expect(behaviors.rowSizeFg()).toBe("dim")
		expect(behaviors.rowMarker(null, { item: FILE, index: 0, cursor: 0, marked: new Set() })).toBe("> ")
	})

	test("spaces kind badges are non-blank and dirs pair a slash with a size label", () => {
		// The redesign relies on a marker + slash so rows are not colour-only.
		expect(rowName(DIR)).toBe("sub/")
		expect(rowSize(DIR)).toBe("<dir>")
		expect(rowSize(FILE)).toBe("10B")
	})

	test("behaviors read reactive cursor and marks at use", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const cursor = cell(0)
		const marked = cell(new Set())
		const data = { item: FILE, index: 1, cursor, marked }
		expect(behaviors.rowClass(null, data)).toBeNull()
		expect(behaviors.rowMarker(null, data)).toBe("  ")
		cursor.set(1)
		expect(behaviors.rowClass(null, data)).toBe("is-current")
		expect(behaviors.rowMarker(null, data)).toBe("> ")
		marked.set(new Set(["/a.txt"]))
		expect(behaviors.rowMarker(null, data)).toBe("* ")
		expect(behaviors.rowMarkerFg(null, data)).toBe("mark")
	})
})
