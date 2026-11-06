import { describe, expect, test } from "bun:test"
import { createDesktopOs } from "../../src/js/tcmd/desktop/os.js"

// The tinyjs host adapter's captured command path. The backend (`hostCapture`)
// runs under txiki.js; here we cover the frontend contract the VCS adapter
// depends on: forward the argv/options and map a null result to null.
describe("desktop os capture", () => {
	test("forwards the command, args and options to hostCapture", async () => {
		const calls = []
		const os = createDesktopOs({
			call: async (method, params) => {
				calls.push({ method, params })
				return { code: 0, stdout: "out", stderr: "err" }
			},
			tiny: {},
		})
		const result = await os.capture("git", ["status", "--porcelain"], { cwd: "/repo", input: "a\0", timeout: 50 })
		expect(calls).toEqual([
			{
				method: "hostCapture",
				params: { command: "git", args: ["status", "--porcelain"], cwd: "/repo", input: "a\0", timeout: 50 },
			},
		])
		expect(result).toEqual({ code: 0, stdout: "out", stderr: "err" })
	})

	test("a null backend result stays null", async () => {
		const os = createDesktopOs({ call: async () => null, tiny: {} })
		expect(await os.capture("jj", ["diff"])).toBeNull()
	})

	test("missing stdout/stderr default to empty strings", async () => {
		const os = createDesktopOs({ call: async () => ({ code: 1 }), tiny: {} })
		expect(await os.capture("git", ["status"])).toEqual({ code: 1, stdout: "", stderr: "" })
	})
})
