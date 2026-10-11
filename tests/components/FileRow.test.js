import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors, isMarked, rowIcon, rowName, rowSize } from "../../src/js/tcmd/components/FileRow.js"
import { DIR_ICON, SYMLINK_ICON } from "../../src/js/tcmd/components/icons.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

const DIR = { isDir: true, name: "sub", path: "/sub", size: 0 }
const FILE = { isDir: false, name: "a.txt", path: "/a.txt", size: 10 }
const LINK = { isDir: false, isSymlink: true, name: "ln", path: "/ln", size: 0 }
const DEV = { isDir: false, isDevice: true, name: "null", path: "/dev/null", size: 0 }

describe("FileRow", () => {
	test("names, sizes and markers", () => {
		expect(rowName(DIR)).toBe("sub/")
		expect(rowSize(DIR)).toBe("<dir>")
		expect(rowName(FILE)).toBe("a.txt")
		expect(rowSize(FILE)).toBe("10B")
		expect(isMarked(FILE, new Set(["/a.txt"]))).toBe(true)
		// Icons live in their own slot, gated by the environment flag.
		expect(rowIcon(DIR, true)).toBe(DIR_ICON)
		expect(rowIcon(DIR, false)).toBe("")
	})

	test("behaviors read plain cursor and marks", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowName(null, { item: DIR })).toBe("sub/")
		expect(behaviors.rowBg(null, { index: 1, cursor: 1 })).toBe("cursor")
		expect(behaviors.rowBg(null, { index: 0, cursor: 1 })).toBeUndefined()
		// The inactive pane keeps a muted cursor; a missing flag reads active.
		expect(behaviors.rowBg(null, { index: 1, cursor: 1, active: false })).toBe("cursorInactive")
		expect(behaviors.rowBg(null, { index: 1, cursor: 1, active: true })).toBe("cursor")
		expect(behaviors.rowClass(null, { index: 1, cursor: 1 })).toBe("is-current")
		expect(behaviors.rowClass(null, { index: 0, cursor: 1 })).toBeNull()
		expect(behaviors.rowNameFg(null, { item: DIR })).toBe("dir")
		expect(behaviors.rowNameFg(null, { item: FILE })).toBe("file")
		expect(behaviors.rowNameFg(null, { item: LINK })).toBe("link")
		expect(behaviors.rowNameFg(null, { item: DEV })).toBe("dev")
		expect(behaviors.rowNameClass(null, { item: DIR })).toBe("is-dir")
		expect(behaviors.rowNameClass(null, { item: FILE })).toBeNull()
		expect(behaviors.rowMarkerFg(null, { item: FILE, marked: new Set(["/a.txt"]) })).toBe("mark")
		expect(behaviors.rowMarkerFg(null, { item: FILE, marked: new Set() })).toBe("accent")
		expect(behaviors.rowSizeFg()).toBe("dim")
		expect(behaviors.rowMarker(null, { item: FILE, index: 0, cursor: 0, marked: new Set() })).toBe("> ")
		// The marker reads flags first, marks winning over the cursor.
		expect(behaviors.rowMarker(null, { item: FILE, currentRow: true, markedRow: false })).toBe("> ")
		expect(behaviors.rowMarker(null, { item: FILE, currentRow: false, markedRow: false })).toBe("  ")
		expect(behaviors.rowMarker(null, { item: FILE, currentRow: true, markedRow: true })).toBe("* ")
	})

	test("plain flags win over the shared cursor and marked sources", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// A `cursor` cell (or plain value) saying "current" loses to the
		// `currentRow: false` flag snapshotted by the row builder.
		expect(behaviors.rowClass(null, { index: 1, currentRow: false, cursor: 1 })).toBeNull()
		expect(behaviors.rowBg(null, { index: 1, currentRow: false, cursor: 1 })).toBeUndefined()
		expect(behaviors.rowClass(null, { index: 0, currentRow: true, cursor: 9 })).toBe("is-current")
		expect(behaviors.rowBg(null, { index: 0, currentRow: true, cursor: 9 })).toBe("cursor")
		// Same precedence for the mark flag.
		expect(behaviors.rowMarkerFg(null, { item: FILE, markedRow: false, marked: new Set(["/a.txt"]) })).toBe("accent")
		expect(behaviors.rowMarkerFg(null, { item: FILE, markedRow: true, marked: new Set() })).toBe("mark")
	})

	test("spaces kind badges are non-blank and dirs pair a slash with a size label", () => {
		// The redesign relies on a marker + slash so rows are not colour-only.
		expect(rowName(DIR)).toBe("sub/")
		expect(rowSize(DIR)).toBe("<dir>")
		expect(rowSize(FILE)).toBe("10B")
	})

	test("rows lead with the Nerd Font icon when the env enables them", () => {
		const behaviors = createBehaviors({ ...behaviorEnv, icons: true })
		// The icon is its own dim slot; the name stays plain.
		expect(behaviors.hasIcon()).toBe(true)
		expect(behaviors.rowIcon(null, { item: DIR })).toBe(DIR_ICON)
		expect(behaviors.rowIconFg()).toBe("dim")
		expect(behaviors.rowName(null, { item: DIR })).toBe("sub/")
		expect(behaviors.rowIcon(null, { item: LINK })).toBe(SYMLINK_ICON)
		// Without the flag (web, non-Nerd-Font hosts) the slot collapses.
		expect(createBehaviors(behaviorEnv).hasIcon()).toBe(false)
		expect(createBehaviors(behaviorEnv).rowIcon(null, { item: DIR })).toBe("")
	})

	test("marked rows read orange and the cursor row brighter", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// A marked row takes the selection orange over its kind colour.
		expect(behaviors.rowNameFg(null, { item: FILE, markedRow: true })).toBe("mark")
		expect(behaviors.rowNameFg(null, { item: DIR, markedRow: true })).toBe("mark")
		// The cursor row reads the bright heading colour.
		expect(behaviors.rowNameFg(null, { item: FILE, currentRow: true })).toBe("title")
		// Marks win over the cursor, like the row marker.
		expect(behaviors.rowNameFg(null, { item: FILE, currentRow: true, markedRow: true })).toBe("mark")
		// Untouched rows keep the kind colours.
		expect(behaviors.rowNameFg(null, { item: FILE, currentRow: false })).toBe("file")
		expect(behaviors.rowNameFg(null, { item: LINK, currentRow: false })).toBe("link")
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
