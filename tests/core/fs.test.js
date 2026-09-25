import { describe, expect, test } from "bun:test"
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
