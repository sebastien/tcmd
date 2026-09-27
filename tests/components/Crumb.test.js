import { describe, expect, test } from "bun:test"
import { createBehaviors, crumbLabel, isRoot } from "../../src/js/tcmd/components/Crumb.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Crumb", () => {
	test("labels root and child segments", () => {
		expect(crumbLabel({ name: "/", path: "/" })).toBe("[/] ")
		expect(crumbLabel({ name: "home", path: "/home" })).toBe("home / ")
		expect(isRoot({ path: "/" })).toBe(true)
	})

	test("behaviors map segments to labels and classes", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.crumbLabel(null, { item: { name: "x", path: "/x" } })).toBe("x / ")
		expect(behaviors.crumbFg(null, { item: { path: "/" } })).toBe("dim")
		expect(behaviors.crumbFg(null, { item: { path: "/x" } })).toBe("title")
		expect(behaviors.crumbClass(null, { item: { path: "/" } })).toBe("is-root")
		expect(behaviors.crumbClass(null, { item: { path: "/x" } })).toBe("is-child")
	})
})
