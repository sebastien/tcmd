import { describe, expect, test } from "bun:test"
import { commandKeys, commandLabel, commandTitle, createBehaviors, isPrimary } from "../../src/js/tcmd/components/CommandItem.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("CommandItem", () => {
	test("labels commands with their keys", () => {
		expect(commandLabel({ title: "Switch", keys: "Tab" })).toBe("Switch[Tab] ")
		expect(commandLabel({ title: "Navigate", keys: "↑/↓" })).toBe("Navigate[↑/↓] ")
		expect(commandLabel({ title: "Run" })).toBe("Run ")
		expect(commandLabel(null)).toBe("")
	})

	test("splits the pill into a title and a shortcut", () => {
		expect(commandTitle({ title: "Open" })).toBe(" Open ")
		expect(commandKeys({ keys: "Enter" })).toBe(" Enter ")
		expect(commandKeys({})).toBe("")
		expect(isPrimary({ primary: true })).toBe(true)
		expect(isPrimary({})).toBe(false)
	})

	test("renders the primary action with the primary accent, the rest secondary", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const primary = { item: { title: "Open", keys: "Enter", primary: true } }
		const secondary = { item: { title: "Parent", keys: "←" } }
		// OP: dark accent ink on the bright accent block.
		expect(behaviors.opFg(null, primary)).toBe("accentBg")
		expect(behaviors.opBg(null, primary)).toBe("accent")
		expect(behaviors.opFg(null, secondary)).toBe("accentSecondaryBg")
		expect(behaviors.opBg(null, secondary)).toBe("mark")
		// KEY: the accent text on the muted grey block.
		expect(behaviors.keyFg(null, primary)).toBe("accent")
		expect(behaviors.keyFg(null, secondary)).toBe("mark")
		expect(behaviors.keyBg()).toBe("muted")
	})

	test("uses Yazi-style Powerline caps to taper accent into grey into default", () => {
		const behaviors = createBehaviors(behaviorEnv)
		const data = { item: { title: "Open", keys: "Enter", primary: true } }
		expect(behaviors.opLeft(null, data)).toBe("")
		// Left cap: the accent fg on the muted grey.
		expect(behaviors.opLeftFg(null, data)).toBe("accent")
		expect(behaviors.opLeftBg()).toBe("muted")
		// Middle cap: accent fg entering the muted block.
		expect(behaviors.mid(null, data)).toBe("")
		expect(behaviors.midFg(null, data)).toBe("accent")
		expect(behaviors.midBg()).toBe("muted")
		// Right cap: muted fg leaving to the terminal default.
		expect(behaviors.end(null, data)).toBe("")
		expect(behaviors.endFg()).toBe("muted")
		expect(behaviors.endBg()).toBeUndefined()
		// Secondary items taper with their own accent.
		const secondary = { item: { title: "Parent", keys: "←" } }
		expect(behaviors.midFg(null, secondary)).toBe("mark")
		expect(behaviors.opLeftFg(null, secondary)).toBe("mark")
		expect(behaviors.opLeft(null, { item: { title: "No key" } })).toBe("")
	})
})
