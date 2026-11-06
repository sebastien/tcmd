import { describe, expect, test } from "bun:test"
import { createVcs, parseGitStatus, parseJjDiff } from "../../src/js/tcmd/core/vcs.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "repo", isDir: true },
		{ name: "plain", isDir: true },
	],
	"/plain": [{ name: "notes.txt", text: "hello\n" }],
	"/repo": [
		{ name: ".git", isDir: true },
		{ name: "src", isDir: true },
	],
	"/repo/src": [
		{ name: "main.js", text: "x" },
		{ name: "added.js", text: "y" },
		{ name: "ignored.log", text: "z" },
	],
}

const ENTRIES = [
	{ name: "main.js", path: "/repo/src/main.js", isDir: false },
	{ name: "added.js", path: "/repo/src/added.js", isDir: false },
	{ name: "ignored.log", path: "/repo/src/ignored.log", isDir: false },
]

// Function: fakeOs
// A host adapter whose `capture` is scripted by the test. `calls` records the
// argv of every invocation.
function fakeOs(handler) {
	const calls = []
	return {
		calls,
		async capture(command, args, options) {
			calls.push({ command, args, options })
			return handler(command, args, options)
		},
	}
}

describe("vcs", () => {
	test("parses git porcelain statuses, renames and ignored entries", () => {
		const statuses = parseGitStatus(
			" M tracked.txt\0?? added.txt\0!! ignored.log\0R  new.txt\0old.txt\0A  staged.txt\0 D gone.txt\0",
		)
		expect(statuses.get("tracked.txt")).toBe("modified")
		expect(statuses.get("added.txt")).toBe("added")
		expect(statuses.get("ignored.log")).toBe("ignored")
		expect(statuses.get("new.txt")).toBe("modified")
		expect(statuses.get("staged.txt")).toBe("added")
		// A deletion has no listing entry to mark.
		expect(statuses.has("gone.txt")).toBe(false)
		// The rename's original path is consumed, not read as a status.
		expect(statuses.size).toBe(5)
	})

	test("strips the trailing slash git uses for untracked and ignored directories", () => {
		const statuses = parseGitStatus("?? newdir/\0!! ignored/\0")
		expect(statuses.get("newdir")).toBe("added")
		expect(statuses.get("ignored")).toBe("ignored")
		expect(statuses.has("newdir/")).toBe(false)
		expect(statuses.has("ignored/")).toBe(false)
	})

	test("parses jj diff template output", () => {
		const statuses = parseJjDiff("added.js\tA\nmain.js\tM\ncopied.js\tC\nold.js\tD\n")
		expect(statuses.get("added.js")).toBe("added")
		expect(statuses.get("main.js")).toBe("modified")
		expect(statuses.get("copied.js")).toBe("added")
		expect(statuses.has("old.js")).toBe(false)
	})

	test("walking up finds the repository and scopes the status command", async () => {
		const fs = createMockFs(TREE)
		const os = fakeOs(() => ({ code: 0, stdout: " M src/main.js\0?? src/added.js\0!! src/ignored.log\0", stderr: "" }))
		const vcs = createVcs({ fs, os, ttl: 0 })
		const info = await vcs.statusFor("/repo/src", ENTRIES)
		expect(info.kind).toBe("git")
		expect(info.root).toBe("/repo")
		expect(info.statuses.get("/repo/src/main.js")).toBe("modified")
		expect(info.statuses.get("/repo/src/added.js")).toBe("added")
		expect(info.statuses.get("/repo/src/ignored.log")).toBe("ignored")
		const call = os.calls[0]
		expect(call.command).toBe("git")
		// The path is a literal git pathspec, so glob characters in a real
		// directory name cannot widen the scope.
		expect(call.args.at(-1)).toBe(":(literal)src")
	})

	test("outside a repository there is no status", async () => {
		const fs = createMockFs(TREE)
		const os = fakeOs(() => ({ code: 0, stdout: "", stderr: "" }))
		const vcs = createVcs({ fs, os, ttl: 0 })
		expect(await vcs.statusFor("/plain", [{ name: "notes.txt", path: "/plain/notes.txt" }])).toBeNull()
		expect(os.calls.length).toBe(0)
	})

	test("a missing git binary still reports the repository", async () => {
		const fs = createMockFs(TREE)
		const os = fakeOs(() => null)
		const vcs = createVcs({ fs, os, ttl: 0 })
		// Detection succeeded even though the status command did not: the
		// identity bar keeps the name and the listing stays status-free.
		const info = await vcs.statusFor("/repo/src", ENTRIES)
		expect(info.kind).toBe("git")
		expect(info.root).toBe("/repo")
		expect(info.statuses.size).toBe(0)
	})

	test("a colocated jj repository uses jj for changes and git for ignored", async () => {
		const tree = { ...TREE }
		tree["/repo"] = [...tree["/repo"], { name: ".jj", isDir: true }]
		const fs = createMockFs(tree)
		const os = fakeOs((command, args) => {
			if (command === "jj" && args.includes("diff")) {
				return { code: 0, stdout: "src/main.js\tM\nsrc/added.js\tA\n", stderr: "" }
			}
			if (command === "git" && args.includes("check-ignore")) {
				return { code: 0, stdout: "src/ignored.log\0", stderr: "" }
			}
			return { code: 1, stdout: "", stderr: "" }
		})
		const vcs = createVcs({ fs, os, ttl: 0 })
		const info = await vcs.statusFor("/repo/src", ENTRIES)
		expect(info.kind).toBe("jj")
		expect(info.statuses.get("/repo/src/main.js")).toBe("modified")
		expect(info.statuses.get("/repo/src/added.js")).toBe("added")
		expect(info.statuses.get("/repo/src/ignored.log")).toBe("ignored")
		const checkIgnore = os.calls.find((call) => call.command === "git")
		expect(checkIgnore.args).toContain("check-ignore")
		// Entries are fed as NUL-delimited paths relative to the repository.
		expect(checkIgnore.options.input).toBe("src/main.js\0src/added.js\0src/ignored.log\0")
	})

	test("a pure jj repository infers ignored files from jj file list", async () => {
		const tree = {
			"/": [{ name: "repo", isDir: true }],
			"/repo": [
				{ name: ".jj", isDir: true },
				{ name: "src", isDir: true },
			],
			"/repo/src": [
				{ name: "main.js", text: "x" },
				{ name: "ignored.log", text: "z" },
			],
		}
		const fs = createMockFs(tree)
		const os = fakeOs((command, args) => {
			if (command !== "jj") return null
			if (args.includes("diff")) return { code: 0, stdout: "src/main.js\tM\n", stderr: "" }
			if (args.includes("list")) return { code: 0, stdout: "src/main.js\n", stderr: "" }
			return null
		})
		const vcs = createVcs({ fs, os, ttl: 0 })
		const entries = [
			{ name: "main.js", path: "/repo/src/main.js", isDir: false },
			{ name: "ignored.log", path: "/repo/src/ignored.log", isDir: false },
		]
		const info = await vcs.statusFor("/repo/src", entries)
		expect(info.kind).toBe("jj")
		expect(info.statuses.get("/repo/src/main.js")).toBe("modified")
		expect(info.statuses.get("/repo/src/ignored.log")).toBe("ignored")
	})

	test("repository metadata directories are never statused", async () => {
		const fs = createMockFs(TREE)
		const os = fakeOs(() => ({ code: 0, stdout: "!! .git/\0!! .jj/\0", stderr: "" }))
		const vcs = createVcs({ fs, os, ttl: 0 })
		const info = await vcs.statusFor("/repo", [
			{ name: ".git", path: "/repo/.git", isDir: true },
			{ name: ".jj", path: "/repo/.jj", isDir: true },
		])
		expect(info.statuses.size).toBe(0)
	})

	test("a directory status is cached for the configured TTL", async () => {
		const fs = createMockFs(TREE)
		const os = fakeOs(() => ({ code: 0, stdout: " M src/main.js\0", stderr: "" }))
		const vcs = createVcs({ fs, os, ttl: 10_000 })
		await vcs.statusFor("/repo/src", ENTRIES)
		await vcs.statusFor("/repo/src", ENTRIES)
		expect(os.calls.length).toBe(1)
	})

	test("without a capture-capable host there is no adapter", () => {
		expect(createVcs({ fs: createMockFs(TREE), os: { copy: () => false } })).toBeNull()
	})
})
