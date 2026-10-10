import { describe, expect, test } from "bun:test"
import { createBehaviors, crumbLabel, crumbSep, isRoot } from "../../src/js/tcmd/components/Crumb.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("Crumb", () => {
	test("labels the root as a bare slash and children by name", () => {
		expect(crumbLabel({ name: "/", path: "/" })).toBe("/")
		expect(crumbLabel({ name: "home", path: "/home" })).toBe("home")
		expect(crumbLabel({ name: "…", path: null })).toBe("…")
		expect(crumbLabel(null)).toBe("")
		expect(isRoot({ path: "/" })).toBe(true)
	})

	test("separates every segment but the basename with a slash", () => {
		expect(crumbSep({ path: "/" }, false)).toBe("")
		expect(crumbSep({ name: "home", path: "/home" }, false)).toBe("/")
		expect(crumbSep({ name: "tcmd", path: "/h/t" }, true)).toBe("")
	})

	test("behaviors map segments to labels, separators and classes", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.crumbLabel(null, { item: { name: "x", path: "/x" } })).toBe("x")
		expect(behaviors.crumbSep(null, { item: { path: "/x" }, last: false })).toBe("/")
		expect(behaviors.crumbSep(null, { item: { path: "/x" }, last: true })).toBe("")
		// Names are heading-colored, slashes and the root dim.
		expect(behaviors.crumbFg(null, { item: { path: "/x" } })).toBe("title")
		expect(behaviors.crumbFg(null, { item: { path: "/" } })).toBe("dim")
		expect(behaviors.crumbSepFg()).toBe("dim")
		expect(behaviors.crumbFg(null, { item: { name: "…", path: null } })).toBe("dim")
		expect(behaviors.crumbClass(null, { item: { path: "/" } })).toBe("is-root")
		expect(behaviors.crumbClass(null, { item: { path: "/x" } })).toBe("is-child")
	})
})
