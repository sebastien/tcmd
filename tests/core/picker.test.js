import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import { getCommandBarItems } from "../../src/js/tcmd/core/bar.js"
import { bindArg } from "../../src/js/tcmd/core/panel.js"
import { replacePlan } from "../../src/js/tcmd/core/operations.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "docs", isDir: true },
		{ name: "notes.txt", text: "hello", size: 5 },
		{ name: "tmp", isDir: true },
	],
	"/home/docs": [{ name: "readme.md", text: "# hi", size: 4 }],
}

async function makeSession(viewMode = "explorer") {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/home/docs" })
	const session = createSession({ fs, left, right, viewMode })
	await Promise.all([left.refresh(), right.refresh()])
	return { fs, session }
}

// Let the picker's queued path resolution (stat + optional navigation) settle.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// Positions the panel cursor on an argument header by name, then browses it.
async function browseArg(session, name) {
	const rowIndex = session.panelRows.value.findIndex(
		(row) => row.type === "arg" && row.name === name,
	)
	session.dispatch("panel.focusArg")
	session.dispatch("panel.setRow", { index: rowIndex })
	await session.dispatch("panel.browse")
}

async function openOp(session, name) {
	session.dispatch("panel.open")
	const index = session.panelFiltered.value.findIndex((entry) => entry.name === name)
	session.dispatch("panel.setOp", { index })
	await Promise.resolve()
}

// Amber/red actions arm `[Confirm]` on the first Run and execute on the second.
async function runPanel(session) {
	await session.dispatch("panel.run")
	return session.dispatch("panel.run")
}

// Puts the left pane's cursor on `name` (the listing sorts directories first,
// so an index is not a stable way to address a file).
function selectEntry(session, name) {
	const index = session.panes.left.entries.value.findIndex((entry) => entry.name === name)
	session.panes.left.cursor.set(index)
}

function binding(session, name) {
	return session.panelDraft.value.find((candidate) => candidate.name === name)
}

describe("file picker", () => {
	test("a dest argument is pickable and defaults to the DST pane only in commander", async () => {
		const commander = (await makeSession("commander")).session
		commander.dispatch("panel.open")
		commander.dispatch("panel.setQuery", { query: "copy" })
		const dst = binding(commander, "TO")
		expect(dst.kind).toBe("dest")
		expect(dst.picker).toBe(true)
		expect(dst.mode).toBe("dir")
		expect(dst.value).toBe("/home/docs")

		const explorer = (await makeSession("explorer")).session
		explorer.dispatch("panel.open")
		explorer.dispatch("panel.setQuery", { query: "copy" })
		// Explorer has no destination pane: the destination opens empty so the
		// picker (or the user) fills it.
		expect(binding(explorer, "TO").value).toBe("")
	})

	test("browsing a dest lists directories only and choosing fills the argument", async () => {
		const { session } = await makeSession()
		await openOp(session, "copy")
		await browseArg(session, "TO")
		expect(session.pickerOpen.value).toBe(true)
		// The picker seats on the current pane's directory with an editable
		// path. Its parent row stays visible, while a dir picker excludes the
		// file `notes.txt`.
		expect(session.pickerPathText.value).toBe("/home/")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual(["..", "docs", "tmp"])
		expect(binding(session, "TO").value).toBe("")
		// A file/any picker keeps the listing intact (a directory row descends).
		session.pickerMode.set("any")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual(["..", "docs", "tmp", "notes.txt"])
		session.pickerMode.set("dir")
		session.dispatch("picker.setCursor", { index: 1 })
		await session.dispatch("picker.enter")
		expect(session.pickerOpen.value).toBe(false)
		expect(binding(session, "TO").value).toBe("/home/docs")
	})

	test("in explorer the source is the working pane, not always the left", async () => {
		const { session } = await makeSession("explorer")
		session.active.set("right")
		session.panes.right.marked.set(new Set(["/home/docs/readme.md"]))
		await openOp(session, "move")
		expect(binding(session, "FROM").items.map((item) => item.path)).toEqual(["/home/docs/readme.md"])
	})

	test("a generic path argument binds as a pickable textual value", async () => {
		const { session } = await makeSession()
		const file = bindArg(session, { name: "P", kind: "path", mode: "file" }, 0)
		expect(file).toMatchObject({ kind: "path", mode: "file", picker: true, textual: true, value: "" })
		// A directory destination pre-fills from the DST pane only in commander.
		const dest = bindArg(session, { name: "TO", kind: "dest" }, 1)
		expect(dest).toMatchObject({ mode: "dir", picker: true })
	})

	test("the picker descends into a directory and steps back up", async () => {
		const { session } = await makeSession()
		await openOp(session, "copy")
		await browseArg(session, "TO")
		session.dispatch("picker.setCursor", { index: 1 })
		await session.dispatch("picker.descend")
		expect(session.pickerPane.path.value).toBe("/home/docs")
		expect(session.pickerPathText.value).toBe("/home/docs/")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual([".."])
		await session.dispatch("picker.parent")
		expect(session.pickerPane.path.value).toBe("/home")
		expect(session.pickerPathText.value).toBe("/home/")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual(["..", "docs", "tmp"])
		// Parent navigation returns the cursor to the directory we came from.
		expect(session.pickerRows.value[session.panelRowIndex.value].name).toBe("docs")
	})

	test("the visible parent row navigates up and is omitted at root", async () => {
		const { session } = await makeSession()
		await openOp(session, "copy")
		await browseArg(session, "TO")
		expect(session.pickerRows.value[0]).toMatchObject({ type: "parent", name: "..", path: "/" })
		await session.dispatch("picker.enter")
		expect(session.pickerPane.path.value).toBe("/")
		expect(session.pickerPathText.value).toBe("/")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual(["home"])
	})

	test("editing the path resolves the directory and filters the entries", async () => {
		const { session } = await makeSession()
		await openOp(session, "copy")
		await browseArg(session, "TO")
		// A partial name stays in the current directory and filters it.
		session.pickerPathText.set("/home/t")
		await tick()
		expect(session.pickerPane.path.value).toBe("/home")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual(["..", "tmp"])
		expect(session.panelRowIndex.value).toBe(1)

		// A complete directory path enters it.
		session.pickerPathText.set("/home/docs")
		await tick()
		expect(session.pickerPane.path.value).toBe("/home/docs")
		expect(session.pickerRows.value.map((row) => row.name)).toEqual([".."])
	})

	test("the picker path commits on Enter", async () => {
		const { session } = await makeSession()
		await openOp(session, "copy")
		await browseArg(session, "TO")
		session.pickerFocus.set("path")
		// A partial path commits the matching row under the cursor.
		session.pickerPathText.set("/home/t")
		await tick()
		await session.dispatch("picker.path")
		expect(session.pickerOpen.value).toBe(false)
		expect(binding(session, "TO").value).toBe("/home/tmp")
	})

	test("an empty destination opens the picker on run, and choosing resumes the run", async () => {
		const { fs, session } = await makeSession()
		// Cursor on the file `notes.txt` is the source when nothing is marked.
		selectEntry(session, "notes.txt")
		await openOp(session, "copy")
		await session.dispatch("panel.run")
		expect(session.pickerOpen.value).toBe(true)
		expect(session.pickerPendingRun.value).toBe(true)
		// Choose `docs`: the copy is amber, so it arms Confirm instead of
		// executing immediately.
		const index = session.pickerRows.value.findIndex((row) => row.name === "docs")
		session.dispatch("picker.setCursor", { index })
		await session.dispatch("picker.enter")
		expect(session.panelArmed.value).toBe(true)
		expect(session.panelRows.value.at(-1).command).toBe("copy /home/notes.txt\n     /home/docs")
		expect((await fs.readDir("/home/docs")).map((entry) => entry.name)).not.toContain("notes.txt")
		// The second Run executes.
		await session.dispatch("panel.run")
		const names = (await fs.readDir("/home/docs")).map((entry) => entry.name)
		expect(names).toContain("notes.txt")
		expect(session.panelOpen.value).toBe(false)
	})

	test("the picker has its own command-bar hints", () => {
		const hints = getCommandBarItems({ filtering: null, bookmarkOpen: false, panelOpen: true, pickerOpen: true })
		expect(hints.map((hint) => hint.title)).toContain("Go")
		expect(hints.map((hint) => hint.title)).toContain("Path")
	})
})

describe("replace", () => {
	test("a single file prefills FIND with its name and previews the mapping", async () => {
		const { session } = await makeSession()
		selectEntry(session, "notes.txt")
		await openOp(session, "replace")
		expect(binding(session, "FIND").value).toBe("notes.txt")
		session.panelDraft.set(
			session.panelDraft.value.map((b) => (b.name === "REPLACE" ? { ...b, value: "readme.txt" } : b)),
		)
		expect(session.panelCommand.value).toContain("notes.txt → readme.txt")
		expect(session.panelPreview.value).toContain("notes.txt → readme.txt")
		expect(session.panelRunnable.value).toBe(true)
		await runPanel(session)
		const names = (await session.fs.readDir("/home")).map((entry) => entry.name)
		expect(names).toContain("readme.txt")
		expect(names).not.toContain("notes.txt")
	})

	test("several files replace with a shared find-and-replace", async () => {
		const { session } = await makeSession()
		session.panes.left.marked.set(new Set(["/home/notes.txt", "/home/docs"]))
		await openOp(session, "replace")
		// More than one path: FIND stays empty for a shared substring.
		expect(binding(session, "FIND").value).toBe("")
		session.panelDraft.set(
			session.panelDraft.value.map((b) => {
				if (b.name === "FIND") return { ...b, value: "o" }
				if (b.name === "REPLACE") return { ...b, value: "0" }
				return b
			}),
		)
		const preview = session.panelCommand.value
		expect(preview).toContain("notes.txt → n0tes.txt")
		expect(preview).toContain("docs → d0cs")
		expect(session.panelPreview.value).toContain("docs → d0cs")
		await runPanel(session)
		const names = (await session.fs.readDir("/home")).map((entry) => entry.name).sort()
		expect(names).toEqual(["d0cs", "n0tes.txt", "tmp"])
	})

	test("replace refuses a target that already exists", async () => {
		const { session } = await makeSession()
		session.panes.left.marked.set(new Set(["/home/notes.txt"]))
		await openOp(session, "replace")
		session.panelDraft.set(
			session.panelDraft.value.map((b) => {
				if (b.name === "FIND") return { ...b, value: "notes.txt" }
				if (b.name === "REPLACE") return { ...b, value: "docs" }
				return b
			}),
		)
		await runPanel(session)
		expect(session.panelRunError.value).toContain("already exists")
		expect(session.notice.value).toBeNull()
	})

	test("replacePlan marks unchanged rows, invalid names and duplicates", () => {
		const plan = replacePlan("txt", "md", ["/a/notes.txt", "/a/b.txt"])
		expect(plan.map((row) => row.newName)).toEqual(["notes.md", "b.md"])
		expect(plan.every((row) => row.changed)).toBe(true)
		// An empty result and a slash are both refused.
		expect(replacePlan("notes.txt", "", ["/a/notes.txt"])[0].error).toBe("empty name")
		expect(replacePlan("a", "b/c", ["/a/a"])[0].error).toBe("name has a slash")
		// A no-op leaves the path unchanged.
		expect(replacePlan("zzz", "y", ["/a/notes.txt"])[0].changed).toBe(false)
	})
})

describe("exact rename", () => {
	test("a selected path prefills FROM, TO and its parent PATH", async () => {
		const { session } = await makeSession()
		selectEntry(session, "notes.txt")
		await openOp(session, "rename")
		expect(binding(session, "FROM").value).toBe("notes.txt")
		expect(binding(session, "TO").value).toBe("notes.txt")
		expect(binding(session, "PATH").value).toBe("/home")
		expect(binding(session, "PATH").picker).toBe(true)
	})

	test("renames one child within PATH and preserves history", async () => {
		const { session } = await makeSession()
		await session.dispatch("panel.open")
		const index = session.panelFiltered.value.findIndex((entry) => entry.name === "rename")
		session.dispatch("panel.setOp", { index })
		session.panelDraft.set(
			session.panelDraft.value.map((item) => {
				if (item.name === "FROM") return { ...item, value: "notes.txt" }
				if (item.name === "TO") return { ...item, value: "memo.txt" }
				return item
			}),
		)
		await runPanel(session)
		expect(await session.fs.stat("/home/notes.txt")).toBeNull()
		expect(await session.fs.stat("/home/memo.txt")).not.toBeNull()
		await session.dispatch("history.undo")
		expect(await session.fs.stat("/home/notes.txt")).not.toBeNull()
	})

	test("the confirm line prints the resolved source and target paths", async () => {
		const { fs, session } = await makeSession()
		// Relativize against this working directory rather than the mock's
		// `/home/tester`, so the pane's own paths read cleanly.
		fs.cwd = () => "/home"
		selectEntry(session, "notes.txt")
		await openOp(session, "rename")
		session.panelDraft.set(
			session.panelDraft.value.map((item) =>
				item.name === "TO" ? { ...item, value: "memo.txt" } : item,
			),
		)
		await session.dispatch("panel.run")
		expect(session.panelArmed.value).toBe(true)
		expect(session.panelRows.value.at(-1).command).toBe("rename notes.txt\n       memo.txt")
	})

	test("the confirm line keeps the directory segment under the cwd", async () => {
		const { fs, session } = await makeSession()
		fs.cwd = () => "/home"
		await openOp(session, "rename")
		session.panelDraft.set(
			session.panelDraft.value.map((item) => {
				if (item.name === "FROM") return { ...item, value: "readme.md" }
				if (item.name === "TO") return { ...item, value: "guide.md" }
				if (item.name === "PATH") return { ...item, value: "/home/docs" }
				return item
			}),
		)
		await session.dispatch("panel.run")
		expect(session.panelRows.value.at(-1).command).toBe(
			"rename docs/readme.md\n       docs/guide.md",
		)
	})
})
