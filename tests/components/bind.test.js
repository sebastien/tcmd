import { describe, expect, test } from "bun:test"
import { bind } from "../../src/js/tcmd/components/bind.js"

describe("bind", () => {
	test("chains component -> does -> using on the given ui runtime", () => {
		const calls = []
		const ui = {
			component(name) {
				calls.push(["component", name])
				return {
					does(behaviors) {
						calls.push(["does", behaviors])
						return {
							using(source) {
								calls.push(["using", source])
								return "BOUND"
							},
						}
					},
				}
			},
		}
		expect(bind(ui, "Crumb", "crumb.xml", { a: 1 })).toBe("BOUND")
		expect(calls).toEqual([
			["component", "Crumb"],
			["does", { a: 1 }],
			["using", "crumb.xml"],
		])
	})
})
