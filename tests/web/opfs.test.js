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

	test("copy and move preserve occupied destinations", async () => {
		const fs = await seededFs()
		await fs.writeText("/home/tester/occupied.txt", "keep")
		await expect(fs.copy("/documents/welcome.txt", "/home/tester/occupied.txt")).rejects.toMatchObject({
			code: "EEXIST",
		})
		await expect(fs.move("/documents/welcome.txt", "/home/tester/occupied.txt")).rejects.toMatchObject({
			code: "EEXIST",
		})
		expect(await fs.readTextHead("/home/tester/occupied.txt")).toBe("keep")
		expect(await fs.readTextHead("/documents/welcome.txt")).toBe("welcome")
	})

	test("concurrent moves to one OPFS destination preserve the losing source", async () => {
		const fs = await seededFs()
		await fs.writeText("/home/tester/first.txt", "first")
		await fs.writeText("/home/tester/second.txt", "second")
		const outcomes = await Promise.allSettled([
			fs.move("/home/tester/first.txt", "/documents/raced.txt"),
			fs.move("/home/tester/second.txt", "/documents/raced.txt"),
		])

		expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
		expect([await fs.stat("/home/tester/first.txt"), await fs.stat("/home/tester/second.txt")].filter(Boolean)).toHaveLength(1)
		expect(["first", "second"]).toContain(await fs.readTextHead("/documents/raced.txt"))
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

	test("trashList records original paths and restore brings them back", async () => {
		const fs = await seededFs()
		await fs.trash(["/home/tester/notes.txt"])
		const rows = await fs.trashList()
		expect(rows.length).toBe(1)
		expect(rows[0].originalPath).toBe("/home/tester/notes.txt")
		expect(await fs.stat("/home/tester/notes.txt")).toBeNull()
		await fs.restore([rows[0].trashPath])
		expect((await fs.stat("/home/tester/notes.txt")).size).toBe("hello\nworld\n".length)
		expect(await fs.trashList()).toEqual([])
	})

	test("restore refuses to overwrite a recreated original path", async () => {
		const fs = await seededFs()
		await fs.trash(["/home/tester/notes.txt"])
		await fs.writeText("/home/tester/notes.txt", "replacement")
		const [row] = await fs.trashList()

		await expect(fs.restore([row.trashPath])).rejects.toMatchObject({ code: "EEXIST" })
		expect(await fs.readTextHead("/home/tester/notes.txt")).toBe("replacement")
		expect((await fs.trashList()).length).toBe(1)
	})

	test("batch restore rejects nested destinations before restoring either item", async () => {
		const fs = await seededFs()
		await fs.writeText("/home/tester/parent/child.txt", "child")
		const [child] = await fs.trash(["/home/tester/parent/child.txt"])
		const [parent] = await fs.trash(["/home/tester/parent"])

		await expect(fs.restore([child.to, parent.to])).rejects.toMatchObject({ code: "EEXIST" })
		expect(await fs.stat("/home/tester/parent/child.txt")).toBeNull()
		expect((await fs.trashList()).length).toBe(2)
	})

	test("batch restore rejects duplicate destinations before restoring either item", async () => {
		const fs = await seededFs()
		await fs.trash(["/home/tester/notes.txt"])
		await fs.writeText("/home/tester/notes.txt", "second version")
		await fs.trash(["/home/tester/notes.txt"])
		const rows = await fs.trashList()

		await expect(fs.restore(rows.map((row) => row.trashPath))).rejects.toMatchObject({ code: "EEXIST" })
		expect(await fs.stat("/home/tester/notes.txt")).toBeNull()
		expect((await fs.trashList()).length).toBe(2)
	})

	test("concurrent trash calls preserve every index record", async () => {
		const fs = await seededFs()
		await Promise.all([
			fs.trash(["/home/tester/notes.txt"]),
			fs.trash(["/documents/welcome.txt"]),
		])

		expect((await fs.trashList()).map((row) => row.originalPath).sort()).toEqual([
			"/documents/welcome.txt",
			"/home/tester/notes.txt",
		])
	})

	test("internal trash metadata cannot be modified through the adapter", async () => {
		const fs = await seededFs()
		await fs.trash(["/home/tester/notes.txt"])
		const before = await fs.readTextHead("/.trash/index.json")

		await expect(fs.trash(["/.trash/index.json"])).rejects.toMatchObject({ code: "EPERM" })
		await expect(fs.move("/.trash/index.json", "/home/tester/index.json")).rejects.toMatchObject({ code: "EPERM" })
		await expect(fs.erase(["/.trash/index.json"])).rejects.toMatchObject({ code: "EPERM" })
		await expect(fs.writeText("/.trash/index.json", "broken")).rejects.toMatchObject({ code: "EPERM" })
		await expect(fs.mkdir("/.trash/subdir")).rejects.toMatchObject({ code: "EPERM" })
		await expect(fs.touch("/.trash/index.json")).rejects.toMatchObject({ code: "EPERM" })

		expect(await fs.readTextHead("/.trash/index.json")).toBe(before)
		expect((await fs.trashList()).length).toBe(1)
	})

	test("large trash indexes retain old restore records", async () => {
		const { root } = createMockOpfs()
		const fs = createOpfsFs({ root })
		await fs.writeText("/home/tester/new.txt", "new trash item")
		const trashDir = await root.getDirectoryHandle(".trash", { create: true })
		for (const [name, text] of [
			["old.txt", "old trash item"],
			[
				"index.json",
				JSON.stringify([
					{ name: "old.txt", originalPath: "/home/tester/old.txt", deletedAt: "2026-01-01", padding: "x".repeat(1 << 20) },
				]),
			],
		]) {
			const handle = await trashDir.getFileHandle(name, { create: true })
			const writable = await handle.createWritable()
			await writable.write(text)
			await writable.close()
		}
		await fs.trash(["/home/tester/new.txt"])

		const rows = await fs.trashList()
		expect(rows.some((row) => row.name === "old.txt")).toBe(true)
		expect(rows.some((row) => row.name.endsWith("-new.txt"))).toBe(true)
	})

	test("mkdir creates directories recursively", async () => {
		const fs = await seededFs()
		await fs.mkdir("/home/tester/new/deep")
		expect((await fs.stat("/home/tester/new/deep"))?.isDir).toBe(true)
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
