import { describe, expect, test } from "bun:test"
import { createPathWatcher, listingSignature } from "../../src/js/tcmd/core/watch.js"

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("watch", () => {
	test("native events are debounced into one notification", async () => {
		const changes = []
		let handler = null
		let stopped = 0
		const fs = {
			watch: (_path, callback) => {
				handler = callback
				return () => {
					stopped += 1
				}
			},
		}
		const stop = createPathWatcher(fs, "/home", () => changes.push(Date.now()), { delay: 10 })
		handler()
		handler()
		handler()
		await delay(30)
		expect(changes.length).toBe(1)
		stop()
		stop()
		expect(stopped).toBe(1)
		// Events delivered after the stop are ignored.
		handler()
		await delay(30)
		expect(changes.length).toBe(1)
	})

	test("an async watcher is awaited and does not also poll", async () => {
		let handler = null
		let closed = 0
		let polled = 0
		const fs = {
			watch: async (_path, onChange) => {
				handler = onChange
				return () => {
					closed += 1
				}
			},
			readDir: async () => {
				polled += 1
				return []
			},
		}
		const changes = []
		const stop = createPathWatcher(fs, "/home", () => changes.push(1), { delay: 5, interval: 10 })
		await delay(20)
		expect(polled).toBe(0)
		handler()
		await delay(20)
		expect(changes.length).toBe(1)
		stop()
		expect(closed).toBe(1)
	})

	test("an async watcher that cannot watch falls back to polling", async () => {
		let polled = 0
		const fs = {
			watch: async () => null,
			readDir: async () => {
				polled += 1
				return []
			},
		}
		const stop = createPathWatcher(fs, "/home", () => {}, { interval: 10 })
		await delay(40)
		expect(polled).toBeGreaterThan(0)
		stop()
	})

	test("a stop before an async watcher resolves closes the late watcher", async () => {
		let resolveWatch
		let closed = 0
		const fs = {
			watch: () =>
				new Promise((resolve) => {
					resolveWatch = resolve
				}),
		}
		const stop = createPathWatcher(fs, "/home", () => {}, { interval: 10 })
		stop()
		resolveWatch(() => {
			closed += 1
		})
		await delay(0)
		expect(closed).toBe(1)
	})

	test("a failed native watcher falls back to polling the listing", async () => {
		let entries = [{ name: "a.txt", size: 1, mtimeMs: 1, mode: 0o100644 }]
		const changes = []
		const fs = {
			watch: () => {
				throw Object.assign(new Error("too many watches"), { code: "ENOSPC" })
			},
			readDir: async () => entries,
		}
		const stop = createPathWatcher(fs, "/home", () => changes.push(1), { interval: 10 })
		await delay(40)
		expect(changes.length).toBe(0)
		entries = [...entries, { name: "b.txt", size: 2, mtimeMs: 2, mode: 0o100644 }]
		await delay(60)
		expect(changes.length).toBe(1)
		// The signature is stable while nothing changes.
		await delay(40)
		expect(changes.length).toBe(1)
		stop()
	})

	test("polling reports a directory that disappears", async () => {
		let missing = false
		const changes = []
		const fs = {
			readDir: async () => {
				if (missing) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
				return [{ name: "a.txt", size: 1, mtimeMs: 1, mode: 0o100644 }]
			},
		}
		const stop = createPathWatcher(fs, "/home", () => changes.push(1), { interval: 10 })
		await delay(40)
		missing = true
		await delay(60)
		expect(changes.length).toBe(1)
		stop()
	})

	test("the listing signature ignores entry order", () => {
		const a = { name: "a", size: 1, mtimeMs: 1, mode: 0o100644 }
		const b = { name: "b", size: 2, mtimeMs: 2, mode: 0o100644 }
		expect(listingSignature([a, b])).toBe(listingSignature([b, a]))
		expect(listingSignature([a])).not.toBe(listingSignature([b]))
		expect(listingSignature([])).toBe("")
	})
})
