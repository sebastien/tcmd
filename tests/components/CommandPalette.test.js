import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/CommandPalette.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandPalette", () => {
	test("exposes palette tokens and focus state", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.bg()).toBe("palette")
		expect(behaviors.titleColor()).toBe("title")
		expect(behaviors.focused(null, { open: true })).toBe(true)
		expect(behaviors.focused(null, { open: false })).toBe(false)
	})

	test("confirm publishes the typed query", () => {
		const published = []
		const self = { pub: (name, payload) => published.push({ name, payload }) }
		const behaviors = createBehaviors(behaviorEnv)
		behaviors.confirm(self, { query: "switch" })
		expect(published).toEqual([{ name: "palette:confirm", payload: "switch" }])
	})

	test("rows are wired only when the renderer provides them", () => {
		const rows = (data) => data.items
		expect(createBehaviors({ ...behaviorEnv, rows }).rows(null, { items: [1] })).toEqual([1])
		expect(createBehaviors(behaviorEnv).rows).toBeUndefined()
	})
})
