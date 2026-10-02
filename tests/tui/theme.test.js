import { describe, expect, test } from "bun:test"
import { DARK, LIGHT, MONO, resolveTheme } from "../../src/js/tcmd/tui/theme.js"

describe("tui theme", () => {
	test("resolves the variant from the environment", () => {
		expect(resolveTheme({})).toBe(DARK)
		expect(resolveTheme({ TCMD_THEME: "dark" })).toBe(DARK)
		expect(resolveTheme({ TCMD_THEME: "light" })).toBe(LIGHT)
		expect(resolveTheme({ TCMD_THEME: "mono" })).toBe(MONO)
	})

	test("NO_COLOR and TERM=dumb fall back to mono, explicit theme wins", () => {
		expect(resolveTheme({ NO_COLOR: "1" })).toBe(MONO)
		expect(resolveTheme({ TERM: "dumb" })).toBe(MONO)
		expect(resolveTheme({ NO_COLOR: "1", TCMD_THEME: "light" })).toBe(LIGHT)
	})

	test("every palette exposes the same token set", () => {
		const keys = Object.keys(DARK).sort()
		expect(Object.keys(LIGHT).sort()).toEqual(keys)
		expect(Object.keys(MONO).sort()).toEqual(keys)
	})

	test("mono uses terminal defaults, so no colour is emitted", () => {
		for (const value of Object.values(MONO)) expect(value).toBeUndefined()
	})
})
