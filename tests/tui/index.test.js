import { describe, expect, test } from "bun:test"
import { readSize } from "../../src/js/tcmd/tui/index.js"

describe("tui entry point", () => {
	test("normalizes renderer resize payloads", () => {
		expect(readSize(80).width).toBe(80)
		expect(readSize(80, 24)).toEqual({ width: 80, height: 24 })
		expect(readSize({ width: 100, height: 30 })).toEqual({ width: 100, height: 30 })
		expect(readSize({ columns: 90, rows: 24 })).toEqual({ width: 90, height: 24 })
		expect(readSize(undefined)).toEqual({})
	})
})
