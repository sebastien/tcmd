import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import {
	createBehaviors,
	isExecutable,
	isMarked,
	isReadonly,
	nameClass,
	rowIcon,
	rowName,
	rowSize,
} from "../../src/js/tcmd/components/FileRow.js"
import { DIR_ICON, SYMLINK_ICON } from "../../src/js/tcmd/components/icons.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

const DIR = { isDir: true, name: "sub", path: "/sub", size: 0 }
const FILE = { isDir: false, name: "a.txt", path: "/a.txt", size: 10 }
const LINK = { isDir: false, isSymlink: true, name: "ln", path: "/ln", size: 0 }
const DEV = { isDir: false, isDevice: true, name: "null", path: "/dev/null", size: 0 }
const RW = { isDir: false, name: "note.txt", path: "/note.txt", size: 10, mode: 0o100644 }
const EXEC = { isDir: false, name: "run.sh", path: "/run.sh", size: 10, mode: 0o100755 }
const RO = { isDir: false, name: "secret", path: "/secret", size: 10, mode: 0o100400 }
const RO_EXEC = { isDir: false, name: "ro-exec", path: "/ro-exec", size: 10, mode: 0o100500 }

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

	test("a symlink shows the target it points at", () => {
		// The `ls -l` tail, after the name (and its directory slash, when the
		// link resolves to a directory).
		expect(rowName({ ...LINK, target: "../real/notes.txt" })).toBe("ln -> ../real/notes.txt")
		expect(
			rowName({ isDir: true, isSymlink: true, name: "docs", path: "/docs", size: 0, target: "../shared" }),
		).toBe("docs/ -> ../shared")
		// An entry with no target (a plain file, or a host that does not
		// resolve links) keeps its plain name.
		expect(rowName(LINK)).toBe("ln")
		expect(rowName(FILE)).toBe("a.txt")
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

	test("colour-mode derives executable and read-only file states", () => {
		// No mode (web backends, mock rows): neither state applies.
		expect(isExecutable(FILE)).toBe(false)
		expect(isReadonly(FILE)).toBe(false)
		// An owner-writable regular file is plain.
		expect(isExecutable(RW)).toBe(false)
		expect(isReadonly(RW)).toBe(false)
		// Any execute bit reads as executable.
		expect(isExecutable(EXEC)).toBe(true)
		expect(isReadonly(EXEC)).toBe(false)
		// Owner write bit clear reads as read-only.
		expect(isReadonly(RO)).toBe(true)
		expect(isExecutable(RO)).toBe(false)
		// Both hold: executable wins over read-only, like `ls --color`.
		expect(isExecutable(RO_EXEC)).toBe(true)
		expect(isReadonly(RO_EXEC)).toBe(true)
		// Directories, symlinks and devices carry their own colours instead.
		expect(isExecutable({ isDir: true, mode: 0o040755 })).toBe(false)
		expect(isReadonly({ isSymlink: true, mode: 0o120777 })).toBe(false)
		expect(isExecutable({ isDevice: true, mode: 0o020666 })).toBe(false)
		expect(isReadonly({ isDevice: true, mode: 0o020444 })).toBe(false)
	})

	test("the executable and read-only states colour the name", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowNameFg(null, { item: EXEC })).toBe("exec")
		expect(behaviors.rowNameFg(null, { item: RO })).toBe("readonly")
		// A plain file, or one with no mode at all, keeps the file colour.
		expect(behaviors.rowNameFg(null, { item: RW })).toBe("file")
		expect(behaviors.rowNameFg(null, { item: FILE })).toBe("file")
		// The web classes mirror the colours; a plain file gets none.
		expect(behaviors.rowNameClass(null, { item: EXEC })).toBe("is-exec")
		expect(behaviors.rowNameClass(null, { item: RO })).toBe("is-readonly")
		expect(behaviors.rowNameClass(null, { item: RW })).toBeNull()
		// The resolver itself is exported for direct use.
		expect(nameClass(EXEC, behaviorEnv)).toBe("is-exec")
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
