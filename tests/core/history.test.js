import { describe, expect, test } from "bun:test"
import { createHistory } from "../../src/js/tcmd/core/history.js"

describe("history", () => {
	test("starts on the initial snapshot", () => {
		const history = createHistory("a")
		expect(history.current()).toBe("a")
		expect(history.index).toBe(0)
		expect(history.stack).toEqual(["a"])
		expect(history.back()).toBeNull()
		expect(history.forward()).toBeNull()
	})

	test("push records after the cursor and truncates the forward branch", () => {
		const history = createHistory("a")
		history.push("b")
		history.push("c")
		expect(history.stack).toEqual(["a", "b", "c"])
		expect(history.index).toBe(2)

		history.back()
		history.push("d")
		expect(history.stack).toEqual(["a", "b", "d"])
		expect(history.index).toBe(2)
		expect(history.forward()).toBeNull()
	})

	test("back and forward move the cursor and return the snapshot", () => {
		const history = createHistory("a")
		history.push("b")
		expect(history.back()).toBe("a")
		expect(history.index).toBe(0)
		expect(history.back()).toBeNull() // no-op at the start
		expect(history.forward()).toBe("b")
		expect(history.index).toBe(1)
		expect(history.forward()).toBeNull() // no-op at the end
	})

	test("replace updates the current entry in place", () => {
		const history = createHistory("a")
		history.push("b")
		history.back()
		history.replace("A")
		expect(history.stack).toEqual(["A", "b"])
		expect(history.index).toBe(0)
		expect(history.current()).toBe("A")
	})
})
