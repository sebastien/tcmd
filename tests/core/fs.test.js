import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
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

	test("readTextHead reads the head of this file", async () => {
		const fs = createNodeFs()
		const head = await fs.readTextHead(new URL(import.meta.url).pathname, 64)
		expect(head.startsWith("import { describe")).toBe(true)
	})
})
