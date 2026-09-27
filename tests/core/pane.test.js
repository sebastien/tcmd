import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createLabels } from "../../src/js/tcmd/core/tab.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
		{ name: "big.bin", size: 4096 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

function makePane(path = "/home") {
	return createPane({ fs: createMockFs(TREE), path })
}

describe("pane", () => {
	test("refresh populates sorted entries with dirs first", async () => {
		const pane = makePane()
		await pane.refresh()
		expect(pane.entries.value.map((e) => e.name)).toEqual(["tester", "big.bin", "notes.txt"])
		expect(pane.loading.value).toBe(false)
		expect(pane.error.value).toBeNull()
	})

	test("navigating into a directory updates path and entries", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.cursor.set(0)
		await pane.open()
		expect(pane.path.value).toBe("/home/tester")
		expect(pane.entries.value.map((e) => e.name)).toEqual(["notes.txt"])
	})

	test("open on a file is a no-op", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.cursor.set(2)
		await pane.open()
		expect(pane.path.value).toBe("/home")
	})

	test("up navigates to parent and resets cursor", async () => {
		const pane = makePane("/home/tester")
		await pane.refresh()
		await pane.up()
		expect(pane.path.value).toBe("/home")
		expect(pane.entries.value.length).toBe(3)
	})

	test("up at root is a no-op", async () => {
		const pane = makePane("/")
		await pane.refresh()
		await pane.up()
		expect(pane.path.value).toBe("/")
	})

	test("filter narrows the visible entries", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.filter.set("txt")
		expect(pane.entries.value.map((e) => e.name)).toEqual(["notes.txt"])
	})

	test("error is captured for missing directories", async () => {
		const pane = makePane("/nope")
		await pane.refresh()
		expect(pane.error.value).toBeTruthy()
		expect(pane.loading.value).toBe(false)
	})

	test("toggleMark adds and removes the current entry", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.toggleMark()
		expect(pane.marked.value.has("/home/tester")).toBe(true)
		pane.toggleMark()
		expect(pane.marked.value.size).toBe(0)
	})

	test("segments produce breadcrumb steps", async () => {
		const pane = makePane("/home/tester")
		expect(pane.segments.value).toEqual([
			{ name: "/", path: "/" },
			{ name: "home", path: "/home" },
			{ name: "tester", path: "/home/tester" },
		])
	})

	test("a pane starts with one tab labelled A", async () => {
		const pane = makePane()
		await pane.refresh()
		expect(pane.tabs.value.length).toBe(1)
		expect(pane.tabs.value[0].label).toBe("A")
		expect(pane.activeIndex.value).toBe(0)
	})

	test("addTab labels the new tab, selects it and keeps per-tab state", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.cursor.set(1)
		await pane.addTab("/home/tester")
		expect(pane.tabs.value.length).toBe(2)
		expect(pane.tabs.value[1].label).toBe("B")
		expect(pane.activeIndex.value).toBe(1)
		expect(pane.path.value).toBe("/home/tester")
		expect(pane.entries.value.map((e) => e.name)).toEqual(["notes.txt"])
		// Back to the first tab: its cursor and path are intact.
		pane.selectTab(0)
		expect(pane.path.value).toBe("/home")
		expect(pane.cursor.value).toBe(1)
	})

	test("marks are per tab", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.cursor.set(2)
		pane.toggleMark()
		await pane.addTab("/home/tester")
		expect(pane.marked.value.size).toBe(0)
		pane.toggleMark()
		expect(pane.marked.value.has("/home/tester/notes.txt")).toBe(true)
		pane.selectTab(0)
		expect(pane.marked.value.has("/home/notes.txt")).toBe(true)
	})

	test("nextTab and prevTab wrap around", async () => {
		const pane = makePane()
		await pane.refresh()
		await pane.addTab("/home/tester")
		pane.nextTab()
		expect(pane.activeIndex.value).toBe(0)
		pane.prevTab()
		expect(pane.activeIndex.value).toBe(1)
	})

	test("closeTab releases the label and refuses to close the last tab", async () => {
		const pane = makePane()
		await pane.refresh()
		await pane.addTab("/home/tester")
		expect(pane.closeTab()).not.toBeNull()
		expect(pane.tabs.value.length).toBe(1)
		expect(pane.tabs.value[0].label).toBe("A")
		expect(pane.closeTab()).toBeNull()
		expect(pane.tabs.value.length).toBe(1)
	})

	test("useLabels relabels the existing tabs in order", async () => {
		const pane = makePane()
		await pane.refresh()
		await pane.addTab("/home/tester")
		const labels = createLabels()
		pane.useLabels(labels)
		expect(pane.tabs.value.map((tab) => tab.label)).toEqual(["A", "B"])
	})
})
