import { describe, expect, test } from "bun:test"
import { createServerToggle, LAN_BIND_HOST, LOCAL_BIND_HOST } from "../../src/js/tcmd/tui/server.js"

// Fake server result: the toggle only reads the bound port and stop().
function fakeServe(calls, onStop) {
	return async (options) => {
		calls.push(options)
		return {
			token: `token-${calls.length}`,
			server: {
				port: options.port,
				stop: async (force) => {
					expect(force).toBe(true)
					onStop()
				},
			},
			url: `http://${options.hostname}:${options.port}`,
		}
	}
}

describe("tui server toggle", () => {
	test("local binds loopback and toggles off on the same mode", async () => {
		const calls = []
		let stops = 0
		const toggle = createServerToggle({
			hostname: "devbox",
			port: 8787,
			serve: fakeServe(calls, () => stops++),
		})
		expect(await toggle.toggle()).toEqual({ mode: "local", url: `http://${LOCAL_BIND_HOST}:8787`, token: "token-1" })
		expect(calls).toEqual([{ hostname: LOCAL_BIND_HOST, port: 8787, quiet: true }])
		expect(await toggle.toggle()).toBeNull()
		expect(stops).toBe(1)
		// An explicit stop while already stopped is a no-op.
		expect(await toggle.toggle("stop")).toBeNull()
		expect(stops).toBe(1)
		// Stopping an already stopped server is a no-op.
		expect(await toggle.stop()).toBeNull()
		expect(stops).toBe(1)
	})

	test("lan binds every interface but displays the machine hostname", async () => {
		const calls = []
		let stops = 0
		const toggle = createServerToggle({
			hostname: "devbox",
			port: 8787,
			serve: fakeServe(calls, () => stops++),
		})
		expect(await toggle.toggle("local")).toEqual({ mode: "local", url: `http://${LOCAL_BIND_HOST}:8787`, token: "token-1" })
		// Asking for the other mode stops loopback first, then binds all
		// interfaces; the URL still names the machine, not the wildcard.
		expect(await toggle.toggle("lan")).toEqual({ mode: "lan", url: "http://devbox:8787", token: "token-2" })
		expect(calls).toEqual([
			{ hostname: LOCAL_BIND_HOST, port: 8787, quiet: true },
			{ hostname: LAN_BIND_HOST, port: 8787, quiet: true },
		])
		expect(stops).toBe(1)
		// The panel's explicit stop mode stops the running server.
		expect(await toggle.toggle("stop")).toBeNull()
		expect(stops).toBe(2)
		// Repeated stop is a no-op.
		expect(await toggle.toggle("stop")).toBeNull()
		expect(stops).toBe(2)
	})
})
