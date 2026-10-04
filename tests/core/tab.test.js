import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createLabels, createTab } from "../../src/js/tcmd/core/tab.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
}

describe("tab", () => {
	test("createLabels allocates, reuses freed labels and spills past Z", () => {
		const labels = createLabels()
		const got = []
		for (let i = 0; i < 27; i++) got.push(labels.acquire())
		expect(got[0]).toBe("A")
		expect(got[25]).toBe("Z")
		expect(got[26]).toBe("A1")
		labels.release("B")
		expect(labels.acquire()).toBe("B")
	})

	test("refresh populates entries and segments per tab", async () => {
		const tab = createTab({ fs: createMockFs(TREE), path: "/home", label: "A", marks: cell({}) })
		await tab.refresh()
		expect(tab.entries.value.map((e) => e.name)).toEqual(["tester", "notes.txt"])
		expect(tab.segments.value.map((segment) => segment.path)).toEqual(["/", "/home"])
	})

	test("toggleMark writes through the shared marks map", async () => {
		const marks = cell({})
		const tab = createTab({ fs: createMockFs(TREE), path: "/home", label: "A", marks })
		await tab.refresh()
		tab.toggleMark()
		expect(tab.marked.value.has("/home/tester")).toBe(true)
		expect(marks.value[tab.id].has("/home/tester")).toBe(true)
		tab.toggleMark()
		expect(marks.value[tab.id].size).toBe(0)
	})

	test("navigate resets filter, marks and cursor", async () => {
		const marks = cell({})
		const tab = createTab({ fs: createMockFs(TREE), path: "/home", label: "A", marks })
		await tab.refresh()
		tab.toggleMark()
		tab.filter.set("notes")
		tab.cursor.set(1)
		await tab.navigate("/home/tester")
		expect(tab.path.value).toBe("/home/tester")
		expect(tab.filter.value).toBe("")
		expect(tab.marked.value.size).toBe(0)
		expect(tab.cursor.value).toBe(0)
	})

	test("filtering narrows entries, resets the cursor and clears", async () => {
		const tab = createTab({ fs: createMockFs(TREE), path: "/home", label: "A", marks: cell({}) })
		await tab.refresh()
		tab.cursor.set(1)
		tab.filter.set("notes")
		expect(tab.entries.value.map((e) => e.name)).toEqual(["notes.txt"])
		expect(tab.cursor.value).toBe(0)
		tab.clearFilter()
		expect(tab.filter.value).toBe("")
		expect(tab.entries.value.map((e) => e.name)).toEqual(["tester", "notes.txt"])
	})

	test("cursorStat enriches the selected entry with stat-only fields", async () => {
		const tab = createTab({ fs: createMockFs(TREE), path: "/home", label: "A", marks: cell({}) })
		await tab.refresh()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(tab.cursorStat.value.name).toBe("tester")
		expect(tab.cursorStat.value.isDir).toBe(true)

		tab.cursor.set(1) // notes.txt
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(tab.cursorStat.value.name).toBe("notes.txt")
		expect(tab.cursorStat.value.mode).toBe(0o100644)
		expect(tab.cursorStat.value.owner).toBe("")
		tab.dispose()
	})
})
