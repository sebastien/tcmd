import { describe, expect, test } from "bun:test"
import { commandLabel, createBehaviors } from "../../src/js/tcmd/components/CommandItem.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandItem", () => {
	test("labels commands with their keys", () => {
		expect(commandLabel({ title: "Switch", keys: "Tab" })).toBe("Switch[Tab] ")
		expect(commandLabel({ title: "Navigate", keys: "↑/↓" })).toBe("Navigate[↑/↓] ")
		expect(commandLabel({ title: "Run" })).toBe("Run ")
		expect(commandLabel(null)).toBe("")
	})

	test("behaviors accent commands and dim key hints", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.itemFg(null, { item: { id: "pane.enter" } })).toBe("accent")
		expect(behaviors.itemFg(null, { item: { id: null } })).toBe("dim")
	})
})
