import { describe, expect, test } from "bun:test"
import {
	filterEntries,
	rankEntries,
	sortEntries,
	viewEntries,
} from "../../src/js/tcmd/core/entries.js"

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

	test("fuzzily matches scattered characters", () => {
		const res = filterEntries(FIXTURE, "zt")
		expect(res.map((e) => e.name)).toEqual(["zeta.txt"])
	})

	test("empty query keeps everything", () => {
		expect(filterEntries(FIXTURE, "  ")).toHaveLength(4)
	})

	test("ranks matches by score, directories first", () => {
		const entries = [entry("shed"), entry("seed")]
		expect(rankEntries(entries, "se", { key: "name", dir: 1 }).map((e) => e.name)).toEqual([
			"seed",
			"shed",
		])
		// A directory wins over a better-scoring file.
		const mixed = [entry("seed"), entry("shed", true)]
		expect(rankEntries(mixed, "se", { key: "name", dir: 1 }).map((e) => e.name)).toEqual([
			"shed",
			"seed",
		])
	})

	test("viewEntries sorts when unfiltered and ranks when filtered", () => {
		expect(viewEntries(FIXTURE, "", { key: "name", dir: 1 }).map((e) => e.name)).toEqual([
			"alpha",
			"mid",
			"beta.txt",
			"zeta.txt",
		])
		expect(viewEntries(FIXTURE, "bet", { key: "name", dir: 1 }).map((e) => e.name)).toEqual([
			"beta.txt",
		])
	})
})
