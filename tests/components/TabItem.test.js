import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors, isActive, tabLabel } from "../../src/js/tcmd/components/TabItem.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("TabItem", () => {
	test("labels tabs by their fileset letter", () => {
		expect(tabLabel({ label: "A" })).toBe("A ")
		expect(tabLabel(null)).toBe("")
	})

	test("behaviors highlight the active tab", () => {
		const active = cell(1)
		const behaviors = createBehaviors(behaviorEnv)
		expect(isActive(1, active)).toBe(true)
		expect(behaviors.tabFg(null, { index: 1, active })).toBe("accent")
		expect(behaviors.tabFg(null, { index: 0, active })).toBe("dim")
		expect(behaviors.tabClass(null, { index: 1, active })).toBe("is-active")
		expect(behaviors.tabClass(null, { index: 0, active })).toBeNull()
	})
})
