import { describe, expect, test } from "bun:test"
import nodePath from "node:path"
import { readSize, startupPath } from "../../src/js/tcmd/tui/index.js"

describe("tui entry point", () => {
	test("resolves relative startup paths against the working directory", () => {
		expect(startupPath("child", "/home")).toBe(nodePath.join(process.cwd(), "child"))
		expect(startupPath("../sibling", "/home")).toBe(nodePath.join(process.cwd(), "..", "sibling"))
		expect(startupPath(".", "/home")).toBe(process.cwd())
	})
	test("keeps absolute startup paths and falls back when absent", () => {
		expect(startupPath("/home/docs", "/home")).toBe("/home/docs")
		expect(startupPath(undefined, "/home")).toBe("/home")
		expect(startupPath("", "/home")).toBe("/home")
	})
	test("normalizes renderer resize payloads", () => {
		expect(readSize(80).width).toBe(80)
		expect(readSize(80, 24)).toEqual({ width: 80, height: 24 })
		expect(readSize({ width: 100, height: 30 })).toEqual({ width: 100, height: 30 })
		expect(readSize({ columns: 90, rows: 24 })).toEqual({ width: 90, height: 24 })
		expect(readSize(undefined)).toEqual({})
	})
})
