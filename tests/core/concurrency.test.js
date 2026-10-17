// The bounded async map both filesystem adapters list directories with: it
// must preserve order, cap concurrency, and never drop an item.

import { describe, expect, test } from "bun:test"
import { createLimiter, mapLimit } from "../../src/js/tcmd/core/concurrency.js"

describe("mapLimit", () => {
	test("preserves order and returns every result", async () => {
		const items = Array.from({ length: 50 }, (_, i) => i)
		const result = await mapLimit(items, 4, async (n) => {
			await new Promise((resolve) => setTimeout(resolve, (50 - n) % 5))
			return n * 2
		})
		expect(result).toEqual(items.map((n) => n * 2))
	})

	test("never runs more mappers than the limit", async () => {
		let inFlight = 0
		let peak = 0
		const result = await mapLimit(Array.from({ length: 40 }, (_, i) => i), 6, async (n) => {
			inFlight += 1
			peak = Math.max(peak, inFlight)
			await new Promise((resolve) => setTimeout(resolve, 1))
			inFlight -= 1
			return n
		})
		expect(result.length).toBe(40)
		expect(peak).toBeLessThanOrEqual(6)
		expect(peak).toBeGreaterThan(1)
	})

	test("handles an empty list and a limit larger than the list", async () => {
		expect(await mapLimit([], 8, async (n) => n)).toEqual([])
		expect(await mapLimit([1, 2, 3], 100, async (n) => n + 1)).toEqual([2, 3, 4])
	})
})

describe("createLimiter", () => {
	test("caps the total in-flight calls and returns every result", async () => {
		const limit = createLimiter(3)
		let inFlight = 0
		let peak = 0
		const results = await Promise.all(
			Array.from({ length: 30 }, (_, i) =>
				limit(async () => {
					inFlight += 1
					peak = Math.max(peak, inFlight)
					await new Promise((resolve) => setTimeout(resolve, 1))
					inFlight -= 1
					return i
				}),
			),
		)
		expect(results).toEqual(Array.from({ length: 30 }, (_, i) => i))
		expect(peak).toBeLessThanOrEqual(3)
		expect(peak).toBeGreaterThan(1)
	})

	test("frees the slot and propagates a rejection", async () => {
		const limit = createLimiter(1)
		await expect(limit(async () => { throw new Error("boom") })).rejects.toThrow("boom")
		// The slot must be free for the next call.
		expect(await limit(async () => "ok")).toBe("ok")
	})
})
