import { describe, expect, test } from "bun:test"
import { createBehaviors, toolLabel } from "../../src/js/tcmd/components/ToolItem.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("ToolItem", () => {
	test("labels commands with their keys", () => {
		expect(toolLabel({ title: "Switch", keys: "Tab" })).toBe("Switch[Tab] ")
		expect(toolLabel(null)).toBe("")
	})

	test("behaviors highlight the first tool", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.toolFg(null, { index: 0 })).toBe("accent")
		expect(behaviors.toolFg(null, { index: 1 })).toBe("dim")
	})
})
