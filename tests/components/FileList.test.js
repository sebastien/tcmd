import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/FileList.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("FileList", () => {
	test("forwards rows and scrollTop to the renderer hooks", () => {
		const rows = (self, data) => data.entries
		const scrollTop = (self, data) => data.cursor
		const behaviors = createBehaviors({ ...behaviorEnv, rows, scrollTop })
		expect(behaviors.rows(null, { entries: ["a"] })).toEqual(["a"])
		expect(behaviors.scrollTop(null, { cursor: 2 })).toBe(2)
	})

	test("omits hooks the renderer does not provide", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rows).toBeUndefined()
		expect(behaviors.scrollTop).toBeUndefined()
	})

	test("exposes empty and loading states", () => {
		const behaviors = createBehaviors(behaviorEnv)
		// Empty listing, not loading: the empty state shows.
		expect(behaviors.showEmpty(null, { entries: [], loading: false })).toBe(true)
		expect(behaviors.showLoading(null, { entries: [], loading: false })).toBe(false)
		// Loading takes over while the read is in flight.
		expect(behaviors.showLoading(null, { entries: [], loading: true })).toBe(true)
		expect(behaviors.showLoading(null, { entries: [{ name: "old.txt" }], loading: true })).toBe(false)
		expect(behaviors.showEmpty(null, { entries: [], loading: true })).toBe(false)
		// A non-empty listing shows neither.
		expect(behaviors.showEmpty(null, { entries: ["a"], loading: false })).toBe(false)
		expect(behaviors.emptyFg()).toBe("dim")
		expect(behaviors.loadingText()).toContain("loading")
	})
})
