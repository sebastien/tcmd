import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import { parseLine, runLine, scriptItems, tokenize } from "../../src/js/tcmd/core/script.js"
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

	test("scriptItems lists operations and filesets, filtered by head token", () => {
		const ops = scriptItems("", [])
		const names = ops.map((row) => row.title)
		expect(names).toEqual([
			"copy",
			"move",
			"delete",
			"erase",
			"stat",
			"touch",
			"sel",
			"edit",
			"view",
			"open",
			"run",
		])
		expect(scriptItems("co", []).map((row) => row.title)).toEqual(["copy"])
		expect(scriptItems("!", []).map((row) => row.title)).toEqual(["run"])

		const filesets = [{ id: "$A", count: 2, paths: ["/a", "/b"] }]
		expect(scriptItems("$a", filesets).map((row) => row.title)).toEqual(["$A"])
		expect(scriptItems("$a", filesets)[0].detail).toBe("2 files")
		// While typing an argument the operation stays listed.
		expect(scriptItems("copy $A", filesets).map((row) => row.title)).toEqual(["$A", "copy"])
	})

	test("scriptItems completes paths from the active tab and replaces the typed token", () => {
		const entries = [
			{ name: "notes.txt", path: "/home/notes.txt", isDir: false, size: 12 },
			{ name: "docs", path: "/home/docs", isDir: true, size: 0 },
		]
		const rows = scriptItems("copy no", [], { entries })
		expect(rows.map((row) => row.title)).toEqual(["copy", "notes.txt"])
		expect(rows[1].detail).toBe("12B")
		expect(rows[1].completion).toBe("copy notes.txt")

		const filesets = [{ id: "$A", count: 1, paths: ["/home/notes.txt"] }]
		expect(scriptItems("copy $", filesets, { entries })[0].completion).toBe("copy $A")
		expect(scriptItems("copy $A", filesets, { entries })[0].completion).toBe("copy $A")
		// Typing an operation name alone completes with a trailing space.
		expect(scriptItems("co", [], { entries })[0].completion).toBe("copy ")
		// A bare path only appears once the user is typing an argument.
		expect(scriptItems("", [], { entries }).map((row) => row.title)).not.toContain("notes.txt")

		// Nested tokens complete against the typed directory listing.
		const nested = scriptItems("copy docs/re", [], {
			entries: [{ name: "readme.md", path: "/home/docs/readme.md", isDir: false, size: 5 }],
		})
		expect(nested.at(-1).completion).toBe("copy docs/readme.md")
		expect(nested.at(-1).title).toBe("readme.md")
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
