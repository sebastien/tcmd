import { describe, expect, test } from "bun:test"
import { createNodeOs } from "../../src/js/tcmd/core/os.js"

// The Node/Bun host adapter's captured command runner. The VCS adapter relies
// on it for `git status` / `jj diff`; these tests cover the process plumbing
// that the VCS tests exercise through a fake host.
describe("os capture", () => {
	test("captures stdout, stderr and a non-zero exit code", async () => {
		const os = createNodeOs()
		const result = await os.capture("sh", ["-c", "printf out; printf err >&2; exit 3"])
		expect(result).toEqual({ code: 3, stdout: "out", stderr: "err" })
	})

	test("feeds stdin to the command", async () => {
		const os = createNodeOs()
		const result = await os.capture("sh", ["-c", "cat"], { input: "héllo\n" })
		expect(result.code).toBe(0)
		expect(result.stdout).toBe("héllo\n")
	})

	test("a missing binary resolves null", async () => {
		const os = createNodeOs()
		expect(await os.capture("tcmd-no-such-binary-xyz", [])).toBeNull()
	})

	test("a timeout kills the command and resolves null", async () => {
		const os = createNodeOs()
		const start = Date.now()
		const result = await os.capture("sh", ["-c", "exec sleep 5"], { timeout: 50 })
		expect(result).toBeNull()
		expect(Date.now() - start).toBeLessThan(2000)
	})

	test("decodes UTF-8 split across chunks", async () => {
		const os = createNodeOs()
		const result = await os.capture(process.execPath, ["-e", "process.stdout.write('é'.repeat(100000))"])
		expect(result.stdout.length).toBe(100000)
		expect(result.stdout.includes("\uFFFD")).toBe(false)
	})

	test("over-large output resolves null instead of a truncated stream", async () => {
		const os = createNodeOs()
		const result = await os.capture(process.execPath, ["-e", "process.stdout.write('x'.repeat(5 * 1024 * 1024))"])
		expect(result).toBeNull()
	})
})
