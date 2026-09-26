import { describe, expect, test } from "bun:test"
import { createBehaviors as crumbBehaviors, crumbLabel, isRoot } from "../../src/js/tcmd/components/Crumb.js"
import { formatCounts, formatDisk, formatSize } from "../../src/js/tcmd/components/format.js"
import {
	cardText,
	createBehaviors as filePreviewBehaviors,
	hasCard,
	hasText,
} from "../../src/js/tcmd/components/FilePreview.js"
import {
	createBehaviors as fileRowBehaviors,
	isMarked,
	rowMarker,
	rowName,
	rowSize,
} from "../../src/js/tcmd/components/FileRow.js"
import { createBehaviors as paletteRowBehaviors, paletteLabel } from "../../src/js/tcmd/components/PaletteRow.js"
import { createBehaviors as summaryBehaviors, summaryText } from "../../src/js/tcmd/components/Summary.js"
import { createBehaviors as toolItemBehaviors, toolLabel } from "../../src/js/tcmd/components/ToolItem.js"

const ENV = {
	accentFg: "accent",
	borderFg: "border",
	childClass: "is-child",
	cursorBg: "cursor",
	currentClass: "is-current",
	dimFg: "dim",
	dirClass: "is-dir",
	dirFg: "dir",
	lineFg: "dim",
	markFg: "mark",
	paletteBg: "palette",
	rootClass: "is-root",
	selectedClass: "selected",
	textFg: "text",
	titleFg: "title",
}

describe("format", () => {
	test("formats sizes, disk and counts", () => {
		expect(formatSize(0)).toBe("0B")
		expect(formatSize(2048)).toBe("2.0K")
		expect(formatDisk({ free: 1024, total: 2048 })).toBe("1.0K free of 2.0K")
		expect(
			formatCounts([
				{ isDir: true, size: 0 },
				{ isDir: false, size: 10 },
			]),
		).toBe("1 dirs, 1 files, 10B")
	})
})

describe("row logic", () => {
	test("Crumb labels root and child segments", () => {
		expect(crumbLabel({ name: "/", path: "/" })).toBe("[/] ")
		expect(crumbLabel({ name: "home", path: "/home" })).toBe("home / ")
		expect(isRoot({ path: "/" })).toBe(true)
		const behaviors = crumbBehaviors(ENV)
		expect(behaviors.crumbLabel(null, { item: { name: "x", path: "/x" } })).toBe("x / ")
		expect(behaviors.crumbFg(null, { item: { path: "/" } })).toBe("dim")
		expect(behaviors.crumbFg(null, { item: { path: "/x" } })).toBe("title")
		expect(behaviors.crumbClass(null, { item: { path: "/" } })).toBe("is-root")
		expect(behaviors.crumbClass(null, { item: { path: "/x" } })).toBe("is-child")
	})

	test("FileRow names, sizes and markers", () => {
		const dir = { isDir: true, name: "sub", path: "/sub", size: 0 }
		const file = { isDir: false, name: "a.txt", path: "/a.txt", size: 10 }
		expect(rowName(dir)).toBe("sub/")
		expect(rowSize(dir)).toBe("<dir>")
		expect(rowName(file)).toBe("a.txt")
		expect(rowSize(file)).toBe("10B")
		expect(rowMarker(file, 0, 0, new Set())).toBe("> ")
		expect(rowMarker(file, 0, 1, new Set())).toBe("  ")
		expect(rowMarker(file, 1, 0, new Set(["/a.txt"]))).toBe("* ")
		expect(isMarked(file, new Set(["/a.txt"]))).toBe(true)

		const behaviors = fileRowBehaviors(ENV)
		expect(behaviors.rowName(null, { item: dir })).toBe("sub/")
		expect(behaviors.rowBg(null, { index: 1, cursor: 1 })).toBe("cursor")
		expect(behaviors.rowBg(null, { index: 0, cursor: 1 })).toBeUndefined()
		expect(behaviors.rowClass(null, { index: 1, cursor: 1 })).toBe("is-current")
		expect(behaviors.rowClass(null, { index: 0, cursor: 1 })).toBeNull()
		expect(behaviors.rowNameFg(null, { item: dir })).toBe("dir")
		expect(behaviors.rowNameFg(null, { item: file })).toBe("text")
		expect(behaviors.rowNameClass(null, { item: dir })).toBe("is-dir")
		expect(behaviors.rowNameClass(null, { item: file })).toBeNull()
		expect(behaviors.rowMarkerFg(null, { item: file, marked: new Set(["/a.txt"]) })).toBe("mark")
		expect(behaviors.rowMarkerFg(null, { item: file, marked: new Set() })).toBe("accent")
		expect(behaviors.rowSizeFg()).toBe("dim")
		expect(behaviors.rowMarker(null, { item: file, index: 0, cursor: 0, marked: new Set() })).toBe("> ")
	})

	test("ToolItem and PaletteRow labels", () => {
		expect(toolLabel({ title: "Switch", keys: "Tab" })).toBe("Switch[Tab] ")
		expect(paletteLabel({ title: "Switch", keys: "Tab" })).toBe("Switch [Tab]")
		expect(toolItemBehaviors(ENV).toolFg(null, { index: 0 })).toBe("accent")
		expect(toolItemBehaviors(ENV).toolFg(null, { index: 1 })).toBe("dim")
		expect(paletteRowBehaviors(ENV).rowFg(null, { index: 1, selected: 1 })).toBe("accent")
		expect(paletteRowBehaviors(ENV).rowFg(null, { index: 0, selected: 1 })).toBe("text")
		expect(paletteRowBehaviors(ENV).rowClass(null, { index: 1, selected: 1 })).toBe("selected")
		expect(paletteRowBehaviors(ENV).rowClass(null, { index: 0, selected: 1 })).toBeNull()
	})

	test("Summary text and elision hook", () => {
		const entries = [{ isDir: false, size: 2048 }]
		expect(summaryText(entries, null)).toBe("0 dirs, 1 files, 2.0K")
		const behaviors = summaryBehaviors({
			...ENV,
			width: () => 4,
			elide: (text, width) => text.slice(0, width),
		})
		expect(behaviors.line(null, { entries, disk: null })).toBe("0 di")
		expect(behaviors.lineFg()).toBe("dim")
	})

	test("FilePreview text, card and visibility", () => {
		const behaviors = filePreviewBehaviors(ENV)
		const textPreview = { kind: "text", title: "a.txt", size: 10, text: "hi" }
		const cardPreview = { kind: "dir", title: "sub", size: 0, text: null }
		expect(hasText(textPreview)).toBe(true)
		expect(hasText(cardPreview)).toBe(false)
		expect(hasCard(cardPreview)).toBe(true)
		expect(hasCard(textPreview)).toBe(false)
		expect(cardText(cardPreview)).toContain("directory: sub")
		expect(behaviors.previewText(null, { preview: textPreview })).toBe("hi")
		expect(behaviors.previewTitle(null, { preview: textPreview })).toBe("a.txt")
		expect(behaviors.previewTitle(null, { preview: null })).toBe("preview")
		expect(behaviors.show(null, { show: true })).toBe(true)
		expect(behaviors.show(null, { show: false })).toBe(false)
		expect(behaviors.textFg()).toBe("text")
		expect(behaviors.dimFg()).toBe("dim")
		expect(behaviors.previewTitleColor()).toBe("title")
	})
})
