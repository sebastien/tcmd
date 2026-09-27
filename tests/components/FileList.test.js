import { describe, expect, test } from "bun:test"
import { createBehaviors } from "../../src/js/tcmd/components/FileList.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("FileList", () => {
	test("forwards rows and scrollTop to the renderer hooks", () => {
		const rows = (data) => data.entries
		const scrollTop = (self, data) => data.cursor
		const behaviors = createBehaviors({ ...behaviorEnv, rows, scrollTop })
		expect(behaviors.rows(null, { entries: ["a"] })).toEqual(["a"])
		expect(behaviors.scrollTop(null, { cursor: 2 })).toBe(2)
	})

	test("omits hooks the renderer does not provide", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rows).toBeUndefined()
		expect(behaviors.scrollTop).toBeUndefined()
	})
})
