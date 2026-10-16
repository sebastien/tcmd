import { describe, expect, test } from "bun:test"
import { createJournal } from "../../src/js/tcmd/core/journal.js"

describe("journal", () => {
	test("records entries and starts with nothing applied", () => {
		const journal = createJournal()
		expect(journal.index.value).toBe(-1)
		expect(journal.canUndo()).toBe(false)
		expect(journal.canRedo()).toBe(false)
		journal.record({ label: "a" })
		journal.record({ label: "b" })
		expect(journal.index.value).toBe(1)
		expect(journal.canUndo()).toBe(true)
		expect(journal.canRedo()).toBe(false)
	})

	test("undo runs the inverse, redo replays it", async () => {
		const journal = createJournal()
		const log = []
		journal.record({ label: "a", undo: () => log.push("-a"), redo: () => log.push("+a") })
		journal.record({ label: "b", undo: () => log.push("-b"), redo: () => log.push("+b") })
		await journal.undo({})
		expect(log).toEqual(["-b"])
		expect(journal.index.value).toBe(0)
		expect(journal.canRedo()).toBe(true)
		await journal.redo({})
		expect(log).toEqual(["-b", "+b"])
		expect(journal.index.value).toBe(1)
		// Undo past the start is a no-op.
		await journal.undo({})
		await journal.undo({})
		expect(journal.index.value).toBe(-1)
		expect(await journal.undo({})).toBeNull()
	})

	test("recording after an undo forks the history", async () => {
		const journal = createJournal()
		journal.record({ label: "a" })
		journal.record({ label: "b" })
		await journal.undo({})
		journal.record({ label: "c" })
		expect(journal.rows().map((row) => row.label)).toEqual(["a", "c"])
		expect(journal.canRedo()).toBe(false)
		expect(journal.index.value).toBe(1)
	})

	test("rows mark the applied set and the pointer", async () => {
		const journal = createJournal()
		journal.record({ label: "a" })
		journal.record({ label: "b" })
		expect(journal.rows().map((row) => [row.label, row.applied, row.current])).toEqual([
			["a", true, false],
			["b", true, true],
		])
		await journal.undo({})
		expect(journal.rows().map((row) => [row.label, row.applied, row.current])).toEqual([
			["a", true, true],
			["b", false, false],
		])
	})

	test("goTo undoes or redoes to a target index", async () => {
		const journal = createJournal()
		const log = []
		for (const name of ["a", "b", "c"]) {
			journal.record({ label: name, undo: () => log.push(`-${name}`), redo: () => log.push(`+${name}`) })
		}
		await journal.goTo({}, 0)
		expect(log).toEqual(["-c", "-b"])
		await journal.goTo({}, 2)
		expect(log).toEqual(["-c", "-b", "+b", "+c"])
		await journal.goTo({}, -1)
		expect(log).toEqual(["-c", "-b", "+b", "+c", "-c", "-b", "-a"])
		expect(journal.index.value).toBe(-1)
	})
})
