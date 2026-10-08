import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import { expandArg, getOperation, getOperations } from "../../src/js/tcmd/core/operations.js"
import { runLine } from "../../src/js/tcmd/core/script.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "tmp", isDir: true },
	],
	"/home": [
		{ name: "docs", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/docs": [{ name: "readme.md", text: "# Hi\n", size: 5 }],
	"/tmp": [],
}

function fakeOs() {
	return {
		edited: [],
		opened: [],
		ran: [],
		async edit(path) {
			this.edited.push(path)
		},
		async open(path) {
			this.opened.push(path)
		},
		async run(command, options = {}) {
			this.ran.push({ command, cwd: options.cwd })
		},
	}
}

async function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/tmp" })
	const os = fakeOs()
	const session = createSession({ fs, os, left, right })
	await Promise.all([left.refresh(), right.refresh()])
	return { fs, os, session }
}

async function names(fs, path) {
	return (await fs.readDir(path)).map((entry) => entry.name)
}

describe("operations", () => {
	test("registry is well-formed and aliases resolve", () => {
		for (const op of getOperations()) {
			expect(op.name.length).toBeGreaterThan(0)
			expect(op.signature).toBeTruthy()
			expect(typeof op.run).toBe("function")
		}
		expect(getOperation("copy").signature).toBe("copy FROM TO")
		expect(getOperation("!").name).toBe("run")
		expect(getOperation("nope")).toBeNull()
	})

	test("path arguments resolve filesets, ~ and relative paths", async () => {
		const { session } = await makeSession()
		session.panes.left.cursor.set(1)
		session.dispatch("list.mark")
		expect(expandArg(session, "$A")).toEqual(["/home/notes.txt"])
		expect(() => expandArg(session, "$NOPE")).toThrow("unknown fileset")
		expect(expandArg(session, "$FILE")).toEqual(["/home/notes.txt"])
		expect(expandArg(session, "notes.txt")).toEqual(["/home/notes.txt"])
		expect(expandArg(session, "/home/docs")).toEqual(["/home/docs"])
		expect(expandArg(session, "~/x")).toEqual(["/home/tester/x"])
	})

	test("copy copies files and directories recursively", async () => {
		const { fs, session } = await makeSession()
		await runLine(session, "copy notes.txt /tmp")
		expect(await names(fs, "/tmp")).toEqual(["notes.txt"])
		await runLine(session, "copy docs /tmp")
		expect(await names(fs, "/tmp")).toEqual(["notes.txt", "docs"])
		expect(await names(fs, "/tmp/docs")).toEqual(["readme.md"])
		expect(session.notice.value.text).toContain("copied")
	})

	test("move moves paths and refreshes the panes", async () => {
		const { fs, session } = await makeSession()
		await runLine(session, "move notes.txt /tmp")
		expect(await names(fs, "/tmp")).toEqual(["notes.txt"])
		expect(await names(fs, "/home")).toEqual(["docs"])
	})

	test("delete moves to trash, erase does not", async () => {
		const { fs, session } = await makeSession()
		await runLine(session, "delete notes.txt")
		expect(fs.trashed).toContain("/home/notes.txt")
		expect(await names(fs, "/home")).toEqual(["docs"])

		const status = await runLine(session, "erase docs")
		expect(status).toBe("confirm")
		expect(session.confirm.value.text).toContain("erase")
		await session.dispatch("confirm.yes")
		expect(await names(fs, "/home")).toEqual([])
	})

	test("erase can be cancelled", async () => {
		const { fs, session } = await makeSession()
		await runLine(session, "erase notes.txt")
		await session.dispatch("confirm.no")
		expect(session.confirm.value).toBeNull()
		expect(await names(fs, "/home")).toEqual(["docs", "notes.txt"])
	})

	test("touch creates missing files", async () => {
		const { fs, session } = await makeSession()
		await runLine(session, "touch fresh.txt")
		expect(await names(fs, "/home")).toEqual(["docs", "notes.txt", "fresh.txt"])
	})

	test("stat pins the preview with size and disk usage", async () => {
		const { session } = await makeSession()
		await runLine(session, "stat docs")
		expect(session.previewTarget.value.path).toBe("/home/docs")
		expect(session.previewTarget.value.details.join("\n")).toContain("directory")
		expect(session.previewTarget.value.details.join("\n")).toContain("5B")
		expect(session.previewTarget.value.isDir).toBe(true)
		await new Promise((resolve) => setTimeout(resolve, 0))
		// Directories still render a card: stat details are not preview text.
		expect(session.preview.value.kind).toBe("directory")
		expect(session.preview.value.title).toBe("docs")
		expect(session.preview.value.text).toBeNull()
	})

	test("view pins the preview to a path", async () => {
		const { session } = await makeSession()
		await runLine(session, "view docs/readme.md")
		expect(session.previewTarget.value.path).toBe("/home/docs/readme.md")
		expect(session.previewTarget.value.name).toBe("readme.md")
	})

	test("sel adds and removes paths from the named buffers", async () => {
		const { session } = await makeSession()
		await runLine(session, "sel notes.txt")
		expect(session.panes.left.marked.value.has("/home/notes.txt")).toBe(true)
		await runLine(session, "sel -A notes.txt")
		expect(session.panes.left.marked.value.size).toBe(0)
		await runLine(session, "sel +B /tmp")
		expect(session.panes.right.marked.value.has("/tmp")).toBe(true)
		expect(await runLine(session, "sel +Z /tmp")).toBe("error")
		expect(session.notice.value.kind).toBe("error")
	})

	test("bookmark op lists, adds and removes named bookmarks", async () => {
		const { session } = await makeSession()
		await runLine(session, "bookmark notes notes.txt")
		expect(session.bookmarks.entries.value.notes).toEqual({ path: "/home/notes.txt", isDir: false })
		await runLine(session, "bookmark docs docs")
		expect(session.bookmarks.entries.value.docs).toEqual({ path: "/home/docs", isDir: true })
		expect(session.bookmarks.rows().map((row) => row.name)).toEqual(["docs", "notes"])
		await runLine(session, "bookmark notes")
		expect(session.bookmarks.entries.value.notes).toBeUndefined()
		expect(await runLine(session, "bookmark ghost")).toBe("error")
	})

	test("edit, open and run go through the host adapter", async () => {
		const { os, session } = await makeSession()
		await runLine(session, "edit notes.txt")
		await runLine(session, "open docs")
		await runLine(session, "run ls -la")
		await runLine(session, "!echo hi")
		expect(os.edited).toEqual(["/home/notes.txt"])
		expect(os.opened).toEqual(["/home/docs"])
		expect(os.ran).toEqual([
			{ command: "ls -la", cwd: "/home" },
			{ command: "echo hi", cwd: "/home" },
		])
	})

	test("unknown operations and bad arity land on the notice", async () => {
		const { session } = await makeSession()
		expect(await runLine(session, "nope")).toBe("error")
		expect(session.notice.value.kind).toBe("error")
		expect(await runLine(session, "copy only-one")).toBe("error")
		expect(session.notice.value.text).toContain("usage: copy FROM TO")
	})
})
