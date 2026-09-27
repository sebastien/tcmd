import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/Toolbar.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Toolbar", () => {
	test("maps commands to rows and exposes the web root class", () => {
		const rows = (data) => data.commands
		const behaviors = createBehaviors({ ...behaviorEnv, listClass: "toolbar", rows })
		expect(behaviors.listClass()).toBe("toolbar")
		expect(behaviors.rows(null, { commands: ["pane.enter"] })).toEqual(["pane.enter"])
	})

	test("omits hooks the renderer does not provide", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rows).toBeUndefined()
		expect(behaviors.listClass()).toBeUndefined()
	})
})
