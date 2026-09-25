import { describe, expect, test } from "bun:test"
import { filterEntries, sortEntries } from "../../src/js/tcmd/core/entries.js"

const entry = (name, isDir = false, size = 0, mtimeMs = 0) => ({
	name,
	path: `/${name}`,
	isDir,
	size,
	mtimeMs,
})

const FIXTURE = [entry("zeta.txt", false, 300), entry("alpha", true), entry("mid", true), entry("beta.txt", false, 100)]

describe("entries", () => {
	test("sorts directories first, then by key", () => {
		const sorted = sortEntries(FIXTURE, { key: "name", dir: 1 })
		expect(sorted.map((e) => e.name)).toEqual(["alpha", "mid", "beta.txt", "zeta.txt"])
	})

	test("sort direction flips within the same group", () => {
		const sorted = sortEntries(FIXTURE, { key: "name", dir: -1 })
		expect(sorted.map((e) => e.name)).toEqual(["mid", "alpha", "zeta.txt", "beta.txt"])
	})

	test("sorts by size and mtime", () => {
		const bySize = sortEntries(FIXTURE, { key: "size", dir: 1 })
		expect(bySize.filter((e) => !e.isDir).map((e) => e.name)).toEqual(["beta.txt", "zeta.txt"])
	})

	test("filters by case-insensitive substring", () => {
		const res = filterEntries(FIXTURE, "BET")
		expect(res.map((e) => e.name)).toEqual(["beta.txt"])
	})

	test("empty query keeps everything", () => {
		expect(filterEntries(FIXTURE, "  ")).toHaveLength(4)
	})
})
