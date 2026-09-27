import { describe, expect, test } from "bun:test"
import { hasMatch, positions, score } from "../../src/js/tcmd/vendor/fzy.js"

describe("vendored fzy", () => {
	test("hasMatch is a case-insensitive subsequence", () => {
		expect(hasMatch("abc", "aXbXc")).toBe(true)
		expect(hasMatch("ABC", "aXbXc")).toBe(true)
		expect(hasMatch("abc", "acb")).toBe(false)
		expect(hasMatch("", "anything")).toBe(true)
	})

	test("score rewards consecutive and word-boundary matches", () => {
		expect(score("se", "seed")).toBeGreaterThan(score("se", "shed"))
		expect(score("amuser", "app/models/user.rb")).toBeGreaterThan(
			score("amuser", "app/models/customer.rb"),
		)
	})

	test("positions reports the matched indices", () => {
		expect(positions("amuser", "app/models/user.rb")).toEqual([0, 4, 11, 12, 13, 14])
	})
})
