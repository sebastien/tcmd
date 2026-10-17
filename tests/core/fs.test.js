import { describe, expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNodeFs } from "../../src/js/tcmd/core/fs.js"

describe("node fs adapter", () => {
	test("reads a directory with stat info", async () => {
		const fs = createNodeFs()
		const entries = await fs.readDir(new URL(".", import.meta.url).pathname.replace(/\/$/, ""))
		expect(entries.length).toBeGreaterThan(0)
		for (const entry of entries) {
			expect(entry.name.length).toBeGreaterThan(0)
			expect(typeof entry.isDir).toBe("boolean")
		}
	})

	test("symlinks report their target and resolve to what they point at", async () => {
		const fs = createNodeFs()
		const root = await mkdtemp(join(tmpdir(), "tcmd-fs-"))
		try {
			await mkdir(join(root, "real-dir"))
			await writeFile(join(root, "real-dir", "inside.txt"), "inside")
			await writeFile(join(root, "notes.txt"), "hello")
			await symlink("notes.txt", join(root, "link.txt"))
			await symlink("real-dir", join(root, "link-dir"))
			await symlink("nowhere", join(root, "broken"))

			const entries = await fs.readDir(root)
			const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]))
			// The raw `readlink` text rides along, relative as written.
			expect(byName["link.txt"].isSymlink).toBe(true)
			expect(byName["link.txt"].target).toBe("notes.txt")
			expect(byName["link-dir"].target).toBe("real-dir")
			expect(byName["broken"].target).toBe("nowhere")
			// A link to a directory *is* a directory: it sorts, opens and
			// previews as one. A broken link stays an ordinary entry.
			expect(byName["link-dir"].isDir).toBe(true)
			expect(byName["link.txt"].isDir).toBe(false)
			expect(byName["broken"].isDir).toBe(false)
			// Reading and stating follow the link.
			expect(await fs.readTextHead(join(root, "link.txt"), 64)).toBe("hello")
			expect((await fs.stat(join(root, "link-dir"))).isDir).toBe(true)
			expect(await fs.isDir(join(root, "link-dir"))).toBe(true)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("stat of a missing path is null", async () => {
		const fs = createNodeFs()
		expect(await fs.stat("/definitely/not/here")).toBeNull()
	})

	test("du sums regular files recursively and ignores symlinks", async () => {
		const root = await mkdtemp(join(tmpdir(), "tcmd-fs-du-"))
		try {
			await writeFile(join(root, "a.txt"), "12345")
			await mkdir(join(root, "sub"))
			await writeFile(join(root, "sub", "b.txt"), "1234567")
			await mkdir(join(root, "sub", "deep"))
			await writeFile(join(root, "sub", "deep", "c.txt"), "1")
			// A symlink contributes nothing, matching `du`'s find semantics.
			await symlink("a.txt", join(root, "link.txt"))
			const fs = createNodeFs()
			expect(await fs.du(root)).toBe(5 + 7 + 1)
			expect(await fs.du(join(root, "a.txt"))).toBe(5)
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("readDir lists a large directory completely and joins paths once", async () => {
		const root = await mkdtemp(join(tmpdir(), "tcmd-fs-many-"))
		try {
			// Enough entries that the bounded concurrent stat pass must drain
			// several worker batches, and a subdirectory plus a link so the
			// classification still holds under the parallel reads.
			const count = 250
			await Promise.all(
				Array.from({ length: count }, (_, i) => writeFile(join(root, `file-${i}.txt`), `${i}`)),
			)
			await mkdir(join(root, "sub"))
			await symlink("file-0.txt", join(root, "link"))
			const fs = createNodeFs()
			const entries = await fs.readDir(root)
			expect(entries.length).toBe(count + 2)
			const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]))
			expect(byName["sub"].isDir).toBe(true)
			expect(byName["link"].isSymlink).toBe(true)
			expect(byName["link"].target).toBe("file-0.txt")
			expect(byName["file-7.txt"].size).toBe("7".length)
			for (const entry of entries) {
				expect(entry.path).toBe(`${root}/${entry.name}`)
			}
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("readTextHead reads the head of this file", async () => {
		const fs = createNodeFs()
		const head = await fs.readTextHead(new URL(import.meta.url).pathname, 64)
		expect(head.startsWith("import { describe")).toBe(true)
	})

	test("copy and move preserve an occupied destination", async () => {
		const root = await mkdtemp(join(tmpdir(), "tcmd-fs-"))
		try {
			const source = join(root, "source.txt")
			const destination = join(root, "destination.txt")
			await writeFile(source, "source")
			await writeFile(destination, "keep")
			const fs = createNodeFs()
			await expect(fs.copy(source, destination)).rejects.toMatchObject({ code: "EEXIST" })
			await expect(fs.move(source, destination)).rejects.toMatchObject({ code: "EEXIST" })
			expect(await readFile(source, "utf8")).toBe("source")
			expect(await readFile(destination, "utf8")).toBe("keep")

			const first = join(root, "first.txt")
			const second = join(root, "second.txt")
			const raced = join(root, "raced.txt")
			await writeFile(first, "first")
			await writeFile(second, "second")
			const outcomes = await Promise.allSettled([fs.move(first, raced), fs.move(second, raced)])
			expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
			expect([await fs.stat(first), await fs.stat(second)].filter(Boolean)).toHaveLength(1)
			expect(["first", "second"]).toContain(await readFile(raced, "utf8"))
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test("trash decodes escaped paths and refuses to overwrite on restore", async () => {
		const dataHome = await mkdtemp(join(tmpdir(), "tcmd-trash-"))
		const previousDataHome = process.env.XDG_DATA_HOME
		const original = join(dataHome, "space name %20.txt")
		try {
			process.env.XDG_DATA_HOME = join(dataHome, "xdg")
			await writeFile(original, "trashed content")
			const fs = createNodeFs()
			const [entry] = await fs.trash([original])
			const [row] = await fs.trashList()
			expect(row.originalPath).toBe(original)

			await writeFile(original, "replacement")
			await expect(fs.restore([entry.to])).rejects.toMatchObject({ code: "EEXIST" })
			expect(await readFile(original, "utf8")).toBe("replacement")

			await rm(original)
			await symlink("missing", original)
			await expect(fs.restore([entry.to])).rejects.toMatchObject({ code: "EEXIST" })
			expect((await lstat(original)).isSymbolicLink()).toBe(true)

			await rm(original)
			await fs.restore([entry.to])
			expect(await readFile(original, "utf8")).toBe("trashed content")
		} finally {
			if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
			else process.env.XDG_DATA_HOME = previousDataHome
			await rm(dataHome, { recursive: true, force: true })
		}
	})

	test("trash lists dangling symlinks and allocates a distinct trash name", async () => {
		const dataHome = await mkdtemp(join(tmpdir(), "tcmd-trash-"))
		const previousDataHome = process.env.XDG_DATA_HOME
		const first = join(dataHome, "first", "link")
		const second = join(dataHome, "second", "link")
		try {
			process.env.XDG_DATA_HOME = join(dataHome, "xdg")
			await mkdir(join(dataHome, "first"))
			await mkdir(join(dataHome, "second"))
			await symlink("missing", first)
			await symlink("missing", second)
			const fs = createNodeFs()
			const trashed = (await Promise.all([fs.trash([first]), fs.trash([second])])).flat()
			const rows = await fs.trashList()
			expect(trashed.map((entry) => entry.name).sort()).toEqual(["link", "link.1"])
			expect(rows.map((row) => row.name).sort()).toEqual(["link", "link.1"])
		} finally {
			if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
			else process.env.XDG_DATA_HOME = previousDataHome
			await rm(dataHome, { recursive: true, force: true })
		}
	})

	test("batch restore rejects nested destinations before restoring either item", async () => {
		const dataHome = await mkdtemp(join(tmpdir(), "tcmd-trash-"))
		const previousDataHome = process.env.XDG_DATA_HOME
		const parent = join(dataHome, "parent")
		const child = join(parent, "child.txt")
		try {
			process.env.XDG_DATA_HOME = join(dataHome, "xdg")
			await mkdir(parent)
			await writeFile(child, "child")
			const fs = createNodeFs()
			const [childTrash] = await fs.trash([child])
			const [parentTrash] = await fs.trash([parent])
			await expect(fs.restore([childTrash.to, parentTrash.to])).rejects.toMatchObject({ code: "EEXIST" })
			expect(await fs.stat(child)).toBeNull()
			expect((await fs.trashList()).length).toBe(2)
		} finally {
			if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
			else process.env.XDG_DATA_HOME = previousDataHome
			await rm(dataHome, { recursive: true, force: true })
		}
	})
})
