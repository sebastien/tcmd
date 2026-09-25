import { describe, expect, test } from "bun:test"
import { basename, join, normalize, parent, prefix, split } from "../../src/js/tcmd/core/path.js"

describe("path", () => {
	test("normalize collapses duplicate separators", () => {
		expect(normalize("/a//b/")).toBe("/a/b")
		expect(normalize("/")).toBe("/")
	})

	test("join handles absolute names and empty parts", () => {
		expect(join("/a/b", "c")).toBe("/a/b/c")
		expect(join("/a/b", "/c")).toBe("/c")
		expect(join("/a/b", "")).toBe("/a/b")
	})

	test("parent stops at root", () => {
		expect(parent("/a/b")).toBe("/a")
		expect(parent("/a")).toBe("/")
		expect(parent("/")).toBeNull()
	})

	test("split and prefix round-trip", () => {
		expect(split("/a/b/c")).toEqual(["a", "b", "c"])
		expect(prefix("/a/b/c", 0)).toBe("/")
		expect(prefix("/a/b/c", 2)).toBe("/a/b")
		expect(prefix("/a/b/c", 3)).toBe("/a/b/c")
		expect(basename("/a/b/c.txt")).toBe("c.txt")
	})
})
