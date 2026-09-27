import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors, paletteLabel } from "../../src/js/tcmd/components/PaletteRow.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("PaletteRow", () => {
	test("labels commands with their keys and script rows without", () => {
		expect(paletteLabel({ title: "Switch", keys: "Tab" })).toBe("Switch [Tab]")
		expect(paletteLabel({ title: "copy" })).toBe("copy")
		expect(paletteLabel(null)).toBe("")
	})

	test("carries detail rows for script operations and filesets", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(paletteLabel({ title: "copy", detail: "copy FROM TO" })).toBe("copy  copy FROM TO")
		expect(paletteLabel({ title: "$A", detail: "2 files" })).toBe("$A  2 files")
		expect(behaviors.paletteLabel(null, { item: { title: "$A", detail: "2 files" } })).toBe(
			"$A  2 files",
		)
	})

	test("behaviors read plain and reactive selection", () => {
		const behaviors = createBehaviors(behaviorEnv)
		expect(behaviors.rowFg(null, { index: 1, selected: 1 })).toBe("accent")
		expect(behaviors.rowFg(null, { index: 0, selected: 1 })).toBe("text")
		expect(behaviors.rowClass(null, { index: 1, selected: 1 })).toBe("selected")
		expect(behaviors.rowClass(null, { index: 0, selected: 1 })).toBeNull()

		const selected = cell(0)
		const data = { item: { title: "Switch", keys: "Tab" }, index: 1, selected }
		expect(behaviors.rowClass(null, data)).toBeNull()
		selected.set(1)
		expect(behaviors.rowClass(null, data)).toBe("selected")
		expect(behaviors.rowFg(null, data)).toBe("accent")
	})
})
