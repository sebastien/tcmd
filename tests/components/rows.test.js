import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { commandItemRows, crumbRows, fileRows, paletteRows, tabItemRows } from "../../src/js/tcmd/components/rows.js"

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
		const data = { segments: [{ path: "/a" }], paneId: "left" }
		expect(crumbRows(Row)(data)).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toBe(data.segments)
		expect(call.processor({ path: "/a" }, 0)).toEqual({
			item: { path: "/a" },
			index: 0,
			paneId: "left",
		})
		expect(call.key({ path: "/a" })).toBe("/a")
	})

	test("fileRows keeps cursor and marked cells in the bag", () => {
		const Row = fakeRow()
		const cursor = cell(1)
		const marked = cell(new Set(["/a.txt"]))
		const entry = { path: "/a.txt" }
		const data = { entries: [entry], cursor, marked, paneId: "right" }
		expect(fileRows(Row)(data)).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toBe(data.entries)
		expect(call.processor(entry, 0)).toEqual({
			item: entry,
			index: 0,
			cursor,
			marked,
			paneId: "right",
		})
		expect(call.key(entry)).toBe("/a.txt")
	})

	test("paletteRows keeps the selected cell and keys by command id", () => {
		const Row = fakeRow()
		const selected = cell(0)
		const command = { id: "pane.toggle" }
		expect(paletteRows(Row)({ items: [command], selected })).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.data).toEqual([command])
		expect(call.processor(command, 0)).toEqual({ item: command, index: 0, selected })
		expect(call.key(command)).toBe("pane.toggle")
	})

	test("tabItemRows keeps the active cell and keys by tab id", () => {
		const Row = fakeRow()
		const active = cell(0)
		const tab = { id: "tab-1", label: "A" }
		expect(tabItemRows(Row)({ tabs: [tab], active, paneId: "left" })).toBe("MAPPED")
		const [call] = Row.calls
		expect(call.processor(tab, 0)).toEqual({ item: tab, index: 0, active, paneId: "left" })
		expect(call.key(tab)).toBe("tab-1")
	})

	test("commandItemRows keys by command id and defaults missing collections", () => {
		const Row = fakeRow()
		const command = { id: "pane.enter" }
		expect(commandItemRows(Row)({ items: [command] })).toBe("MAPPED")
		expect(Row.calls[0].processor(command, 0)).toEqual({ item: command, index: 0 })
		expect(Row.calls[0].key(command)).toBe("pane.enter")
		expect(Row.calls[0].key({ id: null, title: "Navigate", keys: "↑/↓" })).toBe("Navigate:↑/↓")

		const Empty = fakeRow()
		commandItemRows(Empty)({})
		expect(Empty.calls[0].data).toEqual([])
	})
})
