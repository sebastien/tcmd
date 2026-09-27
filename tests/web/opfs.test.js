// OPFS fs adapter: the browser filesystem contracts the core relies on
// (readDir/stat/du/copy/move/trash/…), driven through the in-memory OPFS
// handles from tests/helpers/mock-opfs.js.

import { describe, expect, test } from "bun:test"
import { createOpfsFs } from "../../src/js/tcmd/web/opfs.js"
import { createMockOpfs } from "../helpers/mock-opfs.js"

function makeFs(options = {}) {
	const { root } = createMockOpfs()
	return createOpfsFs({ root, ...options })
}

async function seededFs() {
	const fs = makeFs()
	await fs.writeText("/home/tester/notes.txt", "hello\nworld\n")
	await fs.writeText(
		"/home/tester/projects/tcmd/README.md",
		Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"),
	)
	await fs.writeText("/documents/welcome.txt", "welcome")
	return fs
}

describe("opfs fs adapter", () => {
	test("writeText creates parents and readDir reports entries", async () => {
		const fs = await seededFs()
		const entries = await fs.readDir("/home/tester")
		const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]))
		expect(byName["notes.txt"].isDir).toBe(false)
		expect(byName["notes.txt"].path).toBe("/home/tester/notes.txt")
		expect(byName["notes.txt"].size).toBe("hello\nworld\n".length)
		expect(byName["notes.txt"].ext).toBe("txt")
		expect(byName.projects.isDir).toBe(true)
		expect(byName.projects.size).toBe(0)
	})

	test("stat distinguishes files, directories, the root and missing paths", async () => {
		const fs = await seededFs()
		expect((await fs.stat("/home/tester/notes.txt")).isDir).toBe(false)
		expect((await fs.stat("/home/tester/projects")).isDir).toBe(true)
		expect((await fs.stat("/")).isDir).toBe(true)
		expect(await fs.stat("/nope.txt")).toBeNull()
		expect(await fs.isDir("/documents")).toBe(true)
		expect(await fs.isDir("/documents/welcome.txt")).toBe(false)
		expect(await fs.isDir("/nope")).toBe(false)
	})

	test("readTextHead reads a UTF-8 prefix and fails on missing files", async () => {
		const fs = await seededFs()
		const head = await fs.readTextHead("/home/tester/projects/tcmd/README.md", 12)
		expect(head).toBe("line 0\nline ")
		await expect(fs.readTextHead("/nope.txt")).rejects.toThrow("ENOENT")
	})

	test("du sums file sizes recursively", async () => {
		const fs = await seededFs()
		expect(await fs.du("/home/tester/notes.txt")).toBe("hello\nworld\n".length)
		expect(await fs.du("/home/tester/projects")).toBe(await fs.du("/home/tester/projects/tcmd/README.md"))
		expect(await fs.du("/home/tester")).toBe(
			"hello\nworld\n".length + (await fs.du("/home/tester/projects/tcmd/README.md")),
		)
		expect(await fs.du("/nope")).toBe(0)
	})

	test("copy duplicates files and directories, merging into existing targets", async () => {
		const fs = await seededFs()
		await fs.copy("/home/tester/notes.txt", "/home/tester/copy.txt")
		expect(await fs.readTextHead("/home/tester/copy.txt")).toBe("hello\nworld\n")
		await fs.copy("/home/tester/projects", "/backup")
		expect(await fs.readTextHead("/backup/tcmd/README.md")).toContain("line 99")
		// Copying into an existing directory keeps both trees (merge).
		await fs.copy("/documents", "/backup")
		expect(await fs.readTextHead("/backup/welcome.txt")).toBe("welcome")
		expect(await fs.readTextHead("/backup/tcmd/README.md")).toContain("line 99")
		await expect(fs.copy("/nope", "/backup/nope")).rejects.toThrow("ENOENT")
	})

	test("move relocates files and directories", async () => {
		const fs = await seededFs()
		await fs.move("/documents/welcome.txt", "/home/tester/welcome.txt")
		expect(await fs.stat("/documents/welcome.txt")).toBeNull()
		expect(await fs.readTextHead("/home/tester/welcome.txt")).toBe("welcome")
		await fs.move("/home/tester/projects", "/moved")
		expect(await fs.stat("/home/tester/projects")).toBeNull()
		expect(await fs.readTextHead("/moved/tcmd/README.md")).toContain("line 0")
	})

	test("touch creates empty files and keeps existing contents", async () => {
		const fs = await seededFs()
		await fs.touch("/home/tester/fresh.txt")
		expect((await fs.stat("/home/tester/fresh.txt")).size).toBe(0)
		await fs.touch("/home/tester/notes.txt")
		expect(await fs.readTextHead("/home/tester/notes.txt")).toBe("hello\nworld\n")
	})

	test("erase removes files and directories recursively", async () => {
		const fs = await seededFs()
		await fs.erase(["/home/tester/notes.txt"])
		expect(await fs.stat("/home/tester/notes.txt")).toBeNull()
		await fs.erase(["/home/tester/projects"])
		expect(await fs.stat("/home/tester/projects")).toBeNull()
		await fs.erase(["/"])
		expect(await fs.stat("/")).not.toBeNull()
	})

	test("trash moves entries under /.trash", async () => {
		const fs = await seededFs()
		await fs.trash(["/home/tester/notes.txt", "/documents"])
		expect(await fs.stat("/home/tester/notes.txt")).toBeNull()
		expect(await fs.stat("/documents")).toBeNull()
		const trashed = await fs.readDir("/.trash")
		const names = trashed.map((entry) => entry.name)
		expect(names.some((name) => name.endsWith("-notes.txt"))).toBe(true)
		expect(names.some((name) => name.endsWith("-documents"))).toBe(true)
		const notes = trashed.find((entry) => entry.name.endsWith("-notes.txt"))
		expect(await fs.readTextHead(notes.path)).toBe("hello\nworld\n")
	})

	test("disk reports null without a storage estimate; home/cwd are configurable", async () => {
		const fs = await seededFs()
		expect(await fs.disk()).toBeNull()
		expect(fs.home()).toBe("/home/tester")
		expect(fs.cwd()).toBe("/home/tester")
		const custom = makeFs({ home: "/elsewhere" })
		expect(custom.home()).toBe("/elsewhere")
	})
})
