import { describe, expect, test } from "bun:test"
import { basename, extname, join, normalize, parent, prefix, relative, split } from "../../src/js/tcmd/core/path.js"

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

	test("extname reads a bare filename, a path, and the dotfile cases", () => {
		// The bare-filename fast path (a listing passes names, not paths).
		expect(extname("a.txt")).toBe("txt")
		expect(extname("archive.tar.gz")).toBe("gz")
		expect(extname("noext")).toBeNull()
		// A leading dot is not an extension; a dot on a path resolves on the
		// basename.
		expect(extname(".gitignore")).toBeNull()
		expect(extname("/a/b/c.TXT")).toBe("txt")
		expect(extname("")).toBeNull()
		expect(extname(null)).toBeNull()
	})

	test("relative walks down, across siblings and from the root", () => {
		expect(relative("/a", "/a/b/c")).toBe("b/c")
		expect(relative("/a/b", "/a/b/c")).toBe("c")
		expect(relative("/a/b", "/a/c")).toBe("../c")
		expect(relative("/a/b/c", "/a")).toBe("../..")
		expect(relative("/", "/a/b")).toBe("a/b")
		expect(relative("/a", "/")).toBe("..")
		expect(relative("/a/b", "/a/b")).toBe(".")
		// A non-absolute input has no meaningful base: it comes back as is.
		expect(relative("/a", "b/c")).toBe("b/c")
	})
})
