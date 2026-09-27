import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/Confirm.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Confirm", () => {
	test("shows the pending question with its key hints", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const data = { confirm: { text: "erase notes.txt without trash?" } }
		expect(behaviors.visible(null, data)).toBe(true)
		expect(behaviors.text(null, data)).toBe("erase notes.txt without trash?  [y]es [n]o")
	})

	test("is hidden without a pending confirmation", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.visible(null, { confirm: null })).toBe(false)
		expect(behaviors.text(null, { confirm: null })).toBe("")
		expect(behaviors.keysFg()).toBe("dim")
		expect(behaviors.bg()).toBe("palette")
	})
})
