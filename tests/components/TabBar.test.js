import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/TabBar.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("TabBar", () => {
	test("maps tabs to rows and exposes the web root class", () => {
		const rows = (data) => data.tabs
		const behaviors = createBehaviors({ ...behaviorEnv, listClass: "tabs", rows })
		expect(behaviors.listClass()).toBe("tabs")
		expect(behaviors.rows(null, { tabs: ["A"] })).toEqual(["A"])
	})

	test("exposes the add-tab affordance", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.addLabel()).toBe("+ ")
		expect(behaviors.addFg()).toBe("dim")
		expect(behaviors.rows).toBeUndefined()
	})
})
