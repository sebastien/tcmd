import { describe, expect, test } from "bun:test"
import { createDirectory } from "../../src/js/tcmd/core/directory.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
}

function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("directory", () => {
	test("cursorStat enriches the selected entry with stat-only fields", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		await tick()
		expect(dir.cursorStat.value.name).toBe("tester")
		expect(dir.cursorStat.value.isDir).toBe(true)
		expect(dir.cursorStat.value.mode).toBe(0o040755)

		dir.cursor.set(1) // notes.txt
		await tick()
		expect(dir.cursorStat.value.name).toBe("notes.txt")
		expect(dir.cursorStat.value.mode).toBe(0o100644)
		expect(dir.cursorStat.value.owner).toBe("")
		dir.dispose()
	})

	test("dispose releases the reactive watchers", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		await tick()
		dir.dispose()
		// A filter change no longer snaps the cursor to the top match…
		dir.cursor.set(1)
		dir.filter.set("notes")
		expect(dir.cursor.value).toBe(1)
		// …and moving the cursor no longer re-stats the entry.
		await tick()
		expect(dir.cursorStat.value.name).toBe("tester")
	})
})
