import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
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

	test("a pane owns exactly one directory", async () => {
		const pane = makePane()
		await pane.refresh()
		expect(pane.directory).toBeDefined()
		expect(pane.current()).toBe(pane.directory)
		expect(pane.path.value).toBe("/home")
	})

	test("navigate and up move the single directory", async () => {
		const pane = makePane()
		await pane.refresh()
		await pane.navigate("/home/tester")
		expect(pane.path.value).toBe("/home/tester")
		await pane.up()
		expect(pane.path.value).toBe("/home")
	})

	test("marks are a single buffer on the pane", async () => {
		const pane = makePane()
		await pane.refresh()
		pane.cursor.set(2)
		pane.toggleMark()
		expect(pane.marked.value.size).toBe(1)
		pane.toggleMark()
		expect(pane.marked.value.size).toBe(0)
	})
})
