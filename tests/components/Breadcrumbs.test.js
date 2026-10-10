import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/Breadcrumbs.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Breadcrumbs", () => {
	test("maps segments to rows and exposes the web root class", () => {
		const rows = (self, data) => data.segments
		const behaviors = createBehaviors({ ...behaviorEnv, listClass: "breadcrumbs", rows })
		expect(behaviors.listClass()).toBe("breadcrumbs")
		expect(behaviors.rows(null, { segments: ["/"] })).toEqual(["/"])
	})

	test("omits hooks the renderer does not provide", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rows).toBeUndefined()
		expect(behaviors.listClass()).toBeUndefined()
	})
})
