import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import { parseLine, runLine, tokenize } from "../../src/js/tcmd/core/script.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "docs", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/docs": [{ name: "readme.md", text: "# Hi\n", size: 5 }],
}

async function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	const session = createSession({ fs, left, right })
	await Promise.all([left.refresh(), right.refresh()])
	return { fs, session }
}

describe("script", () => {
	test("tokenize handles whitespace, quotes and escapes", () => {
		expect(tokenize("copy a b")).toEqual(["copy", "a", "b"])
		expect(tokenize('copy "my file.txt" /tmp')).toEqual(["copy", "my file.txt", "/tmp"])
		expect(tokenize("copy 'a b' c")).toEqual(["copy", "a b", "c"])
		expect(tokenize("copy my\\ file.txt /tmp")).toEqual(["copy", "my file.txt", "/tmp"])
		expect(tokenize("  ")).toEqual([])
	})

	test("parseLine resolves operations, aliases and arity", () => {
		expect(parseLine("").status).toBe("empty")
		expect(parseLine("nope").status).toBe("error")
		expect(parseLine("nope").error).toContain("unknown operation")
		expect(parseLine("copy a").status).toBe("error")
		expect(parseLine("copy a b").op.name).toBe("copy")
		expect(parseLine("copy a b").args).toEqual(["a", "b"])
		expect(parseLine("run ls -la").args).toEqual(["ls -la"])
		expect(parseLine("!ls -la").op.name).toBe("run")
		expect(parseLine("!ls -la").args).toEqual(["ls -la"])
	})

	test("runLine reports errors on the session notice", async () => {
		const { session } = await makeSession()
		expect(await runLine(session, "nope")).toBe("error")
		expect(session.notice.value).toEqual({ kind: "error", text: "unknown operation: nope" })
		expect(await runLine(session, "")).toBe("empty")
	})

	test("runLine runs operations and sets a tip notice", async () => {
		const { session } = await makeSession()
		expect(await runLine(session, "touch fresh.txt")).toBe("ran")
		expect(session.notice.value.kind).toBe("tip")
		expect(session.notice.value.text).toContain("touched")
	})
})
