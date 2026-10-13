import { describe, expect, test } from "bun:test"
import { openPanel } from "../../src/js/tcmd/core/commands.js"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import {
	argvFor,
	bindArgs,
	decodePathToken,
	filterPanelEntries,
	missingArg,
	panelCommand,
	panelEntries,
	panelRowList,
	panelRunnable,
	panelSummary,
	pathToken,
	paneSelectionPaths,
	selectedPaths,
	withArgValue,
	withToggledItem,
} from "../../src/js/tcmd/core/panel.js"
import { expandArg } from "../../src/js/tcmd/core/operations.js"
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

// The panel entry for a CLI operation name; these tests exercise the CLI half
// of the union, so no TinyCmd actions are needed.
function entryFor(name) {
	return panelEntries().find((entry) => entry.name === name)
}

async function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/tmp" })
	// The panel's `dest` argument binds the DST pane, a commander concept.
	const session = createSession({ fs, left, right, viewMode: "commander" })
	await Promise.all([left.refresh(), right.refresh()])
	return { fs, session }
}

describe("panel", () => {
	test("lists the CLI operations and the TinyCmd actions, tagged apart", () => {
		const entries = panelEntries([
			{ id: "file.open", title: "Open file", keys: "O" },
			{ id: "nav.up", title: "Cursor up" },
		])
		const cli = entries.filter((entry) => entry.source === "cli").map((entry) => entry.name)
		const app = entries.filter((entry) => entry.source === "app").map((entry) => entry.name)
		expect(cli).toContain("copy")
		expect(cli).toContain("sel")
		expect(cli).toContain("run")
		// Cursor movement is noise and stays out of the list.
		expect(app).toEqual(["Open file"])
		// Every CLI entry carries an operation and an args signature.
		for (const entry of entries.filter((candidate) => candidate.source === "cli")) {
			expect(entry.op.args.length).toBeGreaterThan(0)
		}
	})

	test("filterPanelEntries orders CLI first and ranks matches by importance", () => {
		const entries = panelEntries()
		// No query: every entry, alphabetically by name.
		expect(filterPanelEntries(entries, "").map((entry) => entry.name)).toEqual(
			entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b)),
		)
		// A query ranks by match importance: `open` (prefix) outranks `copy`
		// (a subsequence match).
		expect(filterPanelEntries(entries, "op").map((entry) => entry.name)).toEqual(["open", "copy"])
		expect(filterPanelEntries(entries, "edit").map((entry) => entry.name)).toEqual(["edit"])
		// An alias matches (`!` -> run).
		expect(filterPanelEntries(entries, "!").map((entry) => entry.name)).toEqual(["run"])
		// A signature fragment matches (SEL's `[+|-][BUF]`), ranked last.
		expect(filterPanelEntries(entries, "buf").map((entry) => entry.name)).toEqual(["sel"])
		expect(filterPanelEntries(entries, "zzz")).toEqual([])
	})

	test("binds a selection argument to the cursor entry when nothing is marked", async () => {
		const { session } = await makeSession()
		const bindings = bindArgs(session, entryFor("delete"))
		expect(bindings).toHaveLength(1)
		expect(bindings[0].kind).toBe("selection")
		expect(bindings[0].role).toBe("active")
		expect(paneSelectionPaths(session.panes.left)).toEqual(["/home/docs"])
		expect(selectedPaths(bindings[0])).toEqual(["/home/docs"])
	})

	test("binds a selection argument to the marked set when present", async () => {
		const { session } = await makeSession()
		session.panes.left.cursor.set(1)
		session.dispatch("list.mark")
		const bindings = bindArgs(session, entryFor("copy"))
		expect(selectedPaths(bindings[0])).toEqual(["/home/notes.txt"])
		// The destination binds the DST pane's directory.
		expect(bindings[1].kind).toBe("dest")
		expect(bindings[1].value).toBe("/tmp")
	})

	test("toggling an item flips only that item, transiently", async () => {
		const { session } = await makeSession()
		session.panes.left.cursor.set(0)
		session.panes.left.marked.set(new Set(["/home/docs", "/home/notes.txt"]))
		const draft = bindArgs(session, entryFor("delete"))
		const next = withToggledItem(draft, 0, 0)
		expect(next[0].items.map((i) => i.selected)).toEqual([false, true])
		// The pane marks are untouched.
		expect(session.panes.left.marked.value.has("/home/docs")).toBe(true)
	})

	test("withArgValue sets a textual argument", () => {
		const draft = [{ index: 0, kind: "literal", value: "" }]
		expect(withArgValue(draft, 0, "name")[0].value).toBe("name")
	})

	test("argvFor encodes selection paths and passes literals through", async () => {
		const { session } = await makeSession()
		const bindings = bindArgs(session, entryFor("sel"))
		// Default buffer "+A" plus the active selection.
		const argv = argvFor(bindings)
		expect(argv[0]).toBe("+A")
		expect(argv[1]).toBe(pathToken(["/home/docs"]))
		expect(decodePathToken(argv[1])).toEqual(["/home/docs"])
		expect(await expandArg(session, argv[1])).toEqual(["/home/docs"])
	})

	test("argvFor trims trailing empties but keeps interior placeholders", async () => {
		const { session } = await makeSession()
		// bookmark NAME (optional) PATH (optional): an empty name with a path
		// keeps the placeholder so the path stays in the PATH slot.
		const draft = [
			{ index: 0, name: "NAME", kind: "literal", optional: true, value: "" },
			{ index: 1, name: "PATH", kind: "selection", optional: true, items: [{ path: "/a", selected: true }] },
		]
		expect(argvFor(draft)).toEqual(["", pathToken(["/a"])])
		// Both empty: trimmed down to nothing.
		expect(argvFor(draft.map((b) => ({ ...b, items: [] })))).toEqual([])
	})

	test("missingArg flags interior gaps, empty trailing required args, and empty selections", () => {
		expect(
			missingArg([
				{ index: 0, name: "NAME", kind: "literal", optional: true, value: "" },
				{ index: 1, name: "PATH", kind: "selection", optional: true, items: [{ path: "/a", selected: true }] },
			]),
		).toBe("NAME")
		expect(
			missingArg([{ index: 0, name: "PATH", kind: "selection", items: [] }]),
		).toBe("PATH")
		expect(
			missingArg([
				{ index: 0, name: "FROM", kind: "selection", items: [{ path: "/a", selected: true }] },
				{ index: 1, name: "TO", kind: "dest", value: "/tmp" },
			]),
		).toBeNull()
		// An empty optional trailing arg is fine.
		expect(
			missingArg([
				{ index: 0, name: "NAME", kind: "literal", optional: true, value: "x" },
				{ index: 1, name: "PATH", kind: "selection", optional: true, items: [] },
			]),
		).toBeNull()
	})

	test("pathToken round-trips and rejects non-tokens", () => {
		expect(pathToken(["/a", "/b"])).toBe('$paths:["/a","/b"]')
		expect(decodePathToken('$paths:["/a"]')).toEqual(["/a"])
		expect(decodePathToken("$A")).toBeNull()
		expect(decodePathToken("plain")).toBeNull()
	})

	test("panelRowList flattens arguments and their items", async () => {
		const { session } = await makeSession()
		const rows = panelRowList(bindArgs(session, entryFor("delete")))
		expect(rows[0].type).toBe("arg")
		expect(rows[0].name).toBe("PATH")
		expect(rows[1].type).toBe("item")
		expect(rows[1].path).toBe("/home/docs")
		expect(rows[1].parent).toBe("/home")
		expect(rows[1].marker).toBe("[x]")
	})

	test("panelSummary names the pane and the selected count", () => {
		expect(
			panelSummary({ kind: "selection", role: "source", items: [{ path: "/a", selected: true }] }),
		).toBe("SRC · 1 selected")
		expect(panelSummary({ kind: "dest", value: "/tmp" })).toBe("/tmp")
		expect(panelSummary({ kind: "literal", value: "" })).toBe("(empty)")
	})

	test("panelCommand assembles and shell-quotes the command line", () => {
		// A selection expands to its selected paths, then the destination.
		expect(
			panelCommand([
				{ kind: "selection", name: "FROM", items: [{ path: "/home/a", selected: true }, { path: "/home/b", selected: false }] },
				{ kind: "dest", name: "TO", value: "/tmp" },
			]),
		).toBe("/home/a /tmp")
		// A path with spaces is single-quoted as a shell would show it.
		expect(
			panelCommand([{ kind: "selection", name: "PATH", items: [{ path: "/home/my notes.txt", selected: true }] }]),
		).toBe("'/home/my notes.txt'")
		// A required argument left empty shows a placeholder; an optional one
		// contributes nothing.
		expect(
			panelCommand([
				{ kind: "literal", name: "NAME", optional: true, value: "" },
				{ kind: "selection", name: "PATH", items: [{ path: "/a", selected: true }] },
			]),
		).toBe("/a")
		expect(panelCommand([{ kind: "literal", name: "CMD", value: "" }])).toBe("«CMD»")
	})

	test("panelRunnable mirrors missingArg", () => {
		expect(
			panelRunnable([
				{ kind: "selection", name: "FROM", items: [{ path: "/a", selected: true }] },
				{ kind: "dest", name: "TO", value: "/tmp" },
			]),
		).toBe(true)
		expect(panelRunnable([{ kind: "selection", name: "PATH", items: [] }])).toBe(false)
	})

	test("panelCommand and panelRunnable track the draft through the session", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// The first operation (alphabetically) is `bookmark`; its PATH binds
		// the SRC cursor, and the preview is the full command line. Its NAME —
		// an optional literal before the filled PATH — leaves a positional
		// gap, so the draft is not runnable until the name is filled.
		expect(session.panelEntry.value.name).toBe("bookmark")
		expect(session.panelCommand.value).toBe("bookmark /home/docs")
		expect(session.panelRunnable.value).toBe(false)
		// The panel's CLI rows advertise their argument lists.
		expect(session.panelItems.value.find((item) => item.name === "copy").summary).toBe("FROM TO")
	})

	test("run via panel dispatch executes and stays transient", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.open")
		expect(session.panelOpen.value).toBe(true)
		// The list opens alphabetically, on `bookmark`.
		expect(session.panelEntry.value.name).toBe("bookmark")
		// Toggle the destination op to `delete` and run against the cursor.
		const deleteIndex = session.panelFiltered.value.findIndex((op) => op.name === "delete")
		session.dispatch("panel.setOp", { index: deleteIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(await fs.readDir("/home")).toHaveLength(1)
		// The real marks were never touched.
		expect(session.panes.left.marked.value.size).toBe(0)
	})

	test("run on an incomplete command focuses the missing field", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// `bookmark [NAME] [PATH]`: PATH binds the cursor entry, but the
		// optional NAME before it leaves a positional gap, so the draft is not
		// runnable until NAME is filled.
		const index = session.panelFiltered.value.findIndex((op) => op.name === "bookmark")
		session.dispatch("panel.setOp", { index })
		session.dispatch("panel.focusName")
		await session.dispatch("panel.run")
		// Enter does not fail: it moves the cursor onto the missing NAME field.
		expect(session.panelOpen.value).toBe(true)
		expect(session.notice.value).toBe(null)
		expect(session.panelFocus.value).toBe("field")
		expect(session.panelFields.value[session.panelFieldIndex.value].name).toBe("NAME")
		// Filling the field makes the draft runnable; running closes the panel.
		session.panelDraft.set(
			session.panelDraft.value.map((binding) =>
				binding.name === "NAME" ? { ...binding, value: "memo" } : binding,
			),
		)
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
	})

	test("`:` opens the panel on the first entry, the entry column focused", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelQuery.value).toBe("")
		expect(session.panelOpIndex.value).toBe(0)
		expect(session.panelFocus.value).toBe("ops")
		expect(session.panelEntry.value.name).toBe("bookmark")
	})

	test("a TinyCmd action binds no arguments and dispatches on run", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "Preview" })
		expect(session.panelEntry.value.name).toBe("Preview")
		expect(session.panelEntry.value.source).toBe("app")
		// Nothing to bind: an empty draft, an empty row list, a runnable entry
		// whose "runs" line is the action's title.
		expect(session.panelDraft.value).toEqual([])
		expect(session.panelRows.value).toEqual([])
		expect(session.panelRunnable.value).toBe(true)
		expect(session.panelCommand.value).toBe("Preview")
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(session.showPreview.value).toBe(false)
	})

	test("erase through the panel routes the confirm back to the draft", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.open")
		const eraseIndex = session.panelFiltered.value.findIndex((op) => op.name === "erase")
		session.dispatch("panel.setOp", { index: eraseIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
		expect(session.confirm.value.text).toContain("erase")
		await session.dispatch("confirm.yes")
		expect(await fs.readDir("/home")).toHaveLength(1)
	})

	test("an unknown entry name refuses to open rather than silently selecting the first", async () => {
		const { session } = await makeSession()
		// A renamed/removed operation is a caller bug; landing on `bookmark`
		// would hide it behind a plausible-looking panel.
		expect(() => session.dispatch("panel.shell")).not.toThrow()
		expect(session.panelEntry.value.name).toBe("run")
		expect(() => openPanel(session, { name: "no-such-op" })).toThrow(/no entry named "no-such-op"/)
	})

	test("typing a query filters the entries and anchors the cursor", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "edit" })
		// Both namespaces match; the CLI operation leads its action.
		expect(session.panelFiltered.value.map((entry) => entry.name)).toEqual(["edit", "Edit file"])
		expect(session.panelOpIndex.value).toBe(0)
		expect(session.panelEntry.value.name).toBe("edit")
		// The draft re-binds to the new entry's arguments.
		expect(session.panelDraft.value.map((b) => b.name)).toEqual(["PATH"])
	})

	test("panel.tab walks the name, inline fields and context rows", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// Select `copy`: one textual field (TO, a destination) and one
		// selection binding (FROM: its header row, then its item row).
		expect(session.panelEntry.value.name).toBe("bookmark")
		session.dispatch("panel.setOp", { index: session.panelFiltered.value.findIndex((op) => op.name === "copy") })
		expect(session.panelEntry.value.name).toBe("copy")
		expect(session.panelFocus.value).toBe("ops")
		// Name → the TO inline field.
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("field")
		expect(session.panelFieldIndex.value).toBe(0)
		// Field → the FROM context header, then its item row.
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(0)
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelRowIndex.value).toBe(1)
		// Past the last row: wrap back to the command name.
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("ops")
		// Shift-Tab from the name wraps to the last context row.
		session.dispatch("panel.tab", { delta: -1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(1)
	})

	test("Tab first completes the command name from the typed prefix", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "ren" })
		expect(session.panelEntry.value.name).toBe("rename")
		// The rest of the name is the ghost suffix.
		expect(session.panelCompletion.value).toBe("ame")
		session.dispatch("panel.tab", { delta: 1 })
		// The first Tab completes and stays on the name field.
		expect(session.panelQuery.value).toBe("rename")
		expect(session.panelFocus.value).toBe("ops")
		expect(session.panelCompletion.value).toBe("")
		// A second Tab jumps to the first missing argument (REPLACE; FIND was
		// prefilled with the basename).
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("field")
		expect(session.panelFields.value[session.panelFieldIndex.value].name).toBe("REPLACE")
	})
})
