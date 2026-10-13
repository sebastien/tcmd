import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { bookmarkRows, commandItemRows, crumbRows, fileRows, fileWindow, panelArgRows, panelOpRows } from "../../src/js/tcmd/components/rows.js"

// Captures what each builder passes to `Component.map` and returns a sentinel.
function fakeRow() {
	const calls = []
	return {
		calls,
		map(data, processor, key) {
			calls.push({ data, processor, key })
			return "MAPPED"
		},
	}
}

describe("rows", () => {
	test("crumbRows keeps paneId and keys by segment path", () => {
		const Row = fakeRow()
		const data = { segments: [{ path: "/a" }, { path: "/a/b" }], paneId: "left" }
		expect(crumbRows(Row)(null, data)).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toBe(data.segments)
		expect(call.processor({ path: "/a" }, 0)).toEqual({
			item: { path: "/a" },
			index: 0,
			last: false,
			paneId: "left",
		})
		// The last segment is the basename: no separator after it.
		expect(call.processor({ path: "/a/b" }, 1)).toMatchObject({ index: 1, last: true })
		expect(call.key({ path: "/a" })).toBe("/a")
		// The truncation marker has no path; it keys as "…".
		expect(call.key({ name: "…", path: null })).toBe("…")
	})

	test("fileRows snapshots cursor and marks into plain per-row flags", () => {
		const Row = fakeRow()
		const cursor = cell(1)
		const marked = cell(new Set(["/a.txt"]))
		const entry = { path: "/a.txt" }
		const other = { path: "/b.txt" }
		const data = { entries: [entry, other], cursor, marked, paneId: "right" }
		expect(fileRows(Row)(null, data)).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toBe(data.entries)
		// The shared cells are unwrapped; each row carries plain booleans so a
		// cursor move only rewrites the changed rows.
		expect(call.processor(entry, 1)).toEqual({
			item: entry,
			index: 1,
			currentRow: true,
			markedRow: true,
			active: undefined,
			paneId: "right",
		})
		expect(call.processor(other, 0)).toEqual({
			item: other,
			index: 0,
			currentRow: false,
			markedRow: false,
			active: undefined,
			paneId: "right",
		})
		expect(call.key(entry)).toBe("/a.txt")
	})

	test("fileRows windows a large listing to the visible slice", () => {
		const Row = fakeRow()
		const entries = Array.from({ length: 1000 }, (_, i) => ({ path: `/f${i}` }))
		const cursor = cell(500)
		const marked = cell(new Set())
		const data = { entries, cursor, marked, viewport: 20, paneId: "left" }
		expect(fileRows(Row)(null, data)).toBe("MAPPED")
		const [call] = Row.calls
		// Only the window (viewport + 2 * margin = 36 rows) is mapped.
		expect(call.data.length).toBe(36)
		expect(call.data[0].path).toBe(`/f${500 - 8}`)
		// The windowed row keeps its ORIGINAL index so the cursor still matches.
		expect(call.processor(call.data[8], 8)).toMatchObject({ index: 500, currentRow: true })
		expect(call.key(call.data[0])).toBe(`/f${500 - 8}`)
	})

	test("fileRows backs the window up to the end of the list", () => {
		const Row = fakeRow()
		const entries = Array.from({ length: 1000 }, (_, i) => ({ path: `/f${i}` }))
		const data = { entries, cursor: cell(999), marked: cell(new Set()), viewport: 20 }
		fileRows(Row)(null, data)
		const [call] = Row.calls
		// The last row must be present, so the window clamps at the bottom.
		expect(call.data[call.data.length - 1].path).toBe("/f999")
		expect(call.data.length).toBe(36)
	})

	test("fileRows falls back to the measured scrollbox height", () => {
		const Row = fakeRow()
		const entries = Array.from({ length: 100 }, (_, i) => ({ path: `/f${i}` }))
		const data = { entries, cursor: 50, marked: new Set() }
		// No threaded viewport: the builder measures the mounted scrollbox.
		const self = { ref: { list: { height: 20 } } }
		expect(fileRows(Row)(self, data)).toBe("MAPPED")
		const [call] = Row.calls
		// A 20-row viewport windows to 20 + 2 * 8 = 36 rows around the cursor.
		expect(call.data.length).toBe(36)
		expect(call.data[0].path).toBe(`/f${50 - 8}`)
		// Without either source the whole list is mounted so it can be measured.
		const Bare = fakeRow()
		fileRows(Bare)(null, data)
		expect(Bare.calls[0].data.length).toBe(100)
	})

	test("fileWindow falls back to the full list when the viewport is unknown", () => {
		const data = { entries: [{ path: "/a" }, { path: "/b" }], cursor: 1 }
		expect(fileWindow(data, 0)).toEqual({ start: 0, len: 2, local: 1, total: 2 })
	})

	test("panelOpRows tags each operation row with its index and risk", () => {
		const Row = fakeRow()
		const items = [
			{ type: "op", id: "op:copy", entryIndex: 0, name: "copy", summary: "FROM TO", risk: null },
			{ type: "op", id: "op:erase", entryIndex: 1, name: "erase", summary: "PATH...", risk: "destructive" },
		]
		expect(panelOpRows(Row)(null, { items, opCursor: 1, focus: "ops" })).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toEqual(items)
		expect(call.processor(items[0], 0)).toMatchObject({
			index: 0,
			cursor: 1,
			focus: "ops",
			row: { type: "op", name: "copy", summary: "FROM TO", risk: null },
		})
		expect(call.processor(items[1], 1).row.risk).toBe("destructive")
		expect(call.key(items[0])).toBe("op:copy")
	})

	test("panelArgRows frames a selection's item run and keeps the cursor index", () => {
		const Row = fakeRow()
		const rows = [
			{ type: "arg", key: "arg:0", rowIndex: 0, argIndex: 0, name: "FROM" },
			{ type: "item", key: "item:0:/a", rowIndex: 1, argIndex: 0, name: "a" },
			{ type: "arg", key: "arg:1", rowIndex: 2, argIndex: 1, name: "TO" },
		]
		expect(panelArgRows(Row)(null, { rows, argCursor: 1, focus: "args", labelWidth: 7 })).toBe("MAPPED")
		const [call] = Row.calls
		// A top frame, the item, a bottom frame are injected around the run.
		expect(call.data.map((row) => row.type)).toEqual(["arg", "frame", "item", "frame", "arg"])
		expect(call.data[1].variant).toBe("top")
		expect(call.data[3].variant).toBe("bottom")
		// The item keeps its flat row index (the cursor still addresses it);
		// the frame rows take none.
		expect(call.processor(call.data[2], 2).index).toBe(1)
		expect(call.processor(call.data[1], 1).index).toBe(-1)
		expect(call.processor(call.data[0], 0).labelWidth).toBe(7)
		expect(call.key(call.data[1])).toBe("frame:top:0")
	})

	test("bookmarkRows snapshots selection into a plain per-row flag", () => {
		const Row = fakeRow()
		const selected = cell(0)
		const bookmark = { name: "home", path: "/home" }
		expect(bookmarkRows(Row)(null, { items: [bookmark], selected })).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.processor(bookmark, 0)).toEqual({ item: bookmark, index: 0, selectedRow: true })
		expect(call.processor(bookmark, 1)).toEqual({ item: bookmark, index: 1, selectedRow: false })
		expect(call.key(bookmark)).toBe("home")
	})

	test("commandItemRows keys by command id and defaults missing collections", () => {
		const Row = fakeRow()
		const command = { id: "pane.enter" }
		expect(commandItemRows(Row)(null, { items: [command] })).toBe("MAPPED")
		expect(Row.calls[0].processor(command, 0)).toEqual({ item: command, index: 0 })
		expect(Row.calls[0].key(command)).toBe("pane.enter")
		expect(Row.calls[0].key({ id: null, title: "Navigate", keys: "↑/↓" })).toBe("Navigate:↑/↓")

		const Empty = fakeRow()
		commandItemRows(Empty)(null, {})
		expect(Empty.calls[0].data).toEqual([])
	})
})
