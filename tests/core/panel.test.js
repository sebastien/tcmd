import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import {
	argvFor,
	bindArgs,
	decodePathToken,
	filterPanelOperations,
	missingArg,
	panelCommand,
	panelOperations,
	panelRowList,
	panelRunnable,
	panelSummary,
	pathToken,
	paneSelectionPaths,
	selectedPaths,
	withArgValue,
	withToggledItem,
} from "../../src/js/tcmd/core/panel.js"
import { expandArg, getOperation } from "../../src/js/tcmd/core/operations.js"
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

async function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/tmp" })
	const session = createSession({ fs, left, right })
	await Promise.all([left.refresh(), right.refresh()])
	return { fs, session }
}

describe("panel", () => {
	test("lists the operations that carry an args signature", () => {
		const names = panelOperations().map((op) => op.name)
		expect(names).toContain("copy")
		expect(names).toContain("sel")
		expect(names).toContain("run")
		// Every listed operation has at least one argument descriptor.
		for (const op of panelOperations()) expect(op.args.length).toBeGreaterThan(0)
	})

	test("filterPanelOperations narrows by name, alias and signature", () => {
		const ops = panelOperations()
		expect(filterPanelOperations(ops, "").length).toBe(ops.length)
		expect(filterPanelOperations(ops, "edit").map((op) => op.name)).toEqual(["edit"])
		// An alias matches (`!` -> run).
		expect(filterPanelOperations(ops, "!").map((op) => op.name)).toEqual(["run"])
		// A signature fragment matches (SEL's `[+|-][BUF]`).
		expect(filterPanelOperations(ops, "buf").map((op) => op.name)).toEqual(["sel"])
		expect(filterPanelOperations(ops, "zzz")).toEqual([])
	})

	test("binds a selection argument to the cursor entry when nothing is marked", async () => {
		const { session } = await makeSession()
		const bindings = bindArgs(session, getOperation("delete"))
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
		const bindings = bindArgs(session, getOperation("copy"))
		expect(selectedPaths(bindings[0])).toEqual(["/home/notes.txt"])
		// The destination binds the DST pane's directory.
		expect(bindings[1].kind).toBe("dest")
		expect(bindings[1].value).toBe("/tmp")
	})

	test("toggling an item flips only that item, transiently", async () => {
		const { session } = await makeSession()
		session.panes.left.cursor.set(0)
		session.panes.left.marked.set(new Set(["/home/docs", "/home/notes.txt"]))
		const draft = bindArgs(session, getOperation("delete"))
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
		const bindings = bindArgs(session, getOperation("sel"))
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
		const rows = panelRowList(bindArgs(session, getOperation("delete")))
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
		session.dispatch("panel.toggle")
		// The default copy binds SRC cursor -> DST dir; it is runnable, and the
		// preview is the full command line (operation name + arguments).
		expect(session.panelCommand.value).toBe("copy /home/docs /tmp")
		expect(session.panelRunnable.value).toBe(true)
		// The panel's operation rows advertise their signatures.
		expect(session.panelItems.value.find((item) => item.title === "copy").summary).toBe("FROM TO")
	})

	test("run via panel dispatch executes and stays transient", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.toggle")
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelOperation.value.name).toBe("copy")
		// Toggle the destination op to `delete` and run against the cursor.
		const deleteIndex = session.panelOps.value.findIndex((op) => op.name === "delete")
		session.dispatch("panel.setOp", { index: deleteIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(await fs.readDir("/home")).toHaveLength(1)
		// The real marks were never touched.
		expect(session.panes.left.marked.value.size).toBe(0)
	})

	test("run refuses an unrunnable draft, naming the missing argument", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.toggle")
		// A `run` (raw CMD) draft with no command typed is not runnable.
		const runIndex = session.panelOps.value.findIndex((op) => op.name === "run")
		session.dispatch("panel.setOp", { index: runIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
		expect(session.notice.value?.kind).toBe("error")
		expect(session.notice.value?.text).toContain("«CMD»")
		// Nothing ran; fixing the draft and running again closes the panel.
		session.dispatch("panel.focusArg")
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
	})

	test("`:` opens the panel when enabled and the script palette when not", async () => {
		const { session } = await makeSession()
		// TUI-like (panel enabled): `:` opens the structured panel.
		session.dispatch("panel.open")
		expect(session.panelOpen.value).toBe(true)
		expect(session.paletteOpen.value).toBe(false)
		// Web-like (panel disabled): `:` keeps the script palette.
		session.dispatch("panel.cancel")
		session.panelEnabled.set(false)
		session.dispatch("panel.open")
		expect(session.panelOpen.value).toBe(false)
		expect(session.paletteOpen.value).toBe(true)
		expect(session.paletteMode.value).toBe("script")
	})

	test("erase through the panel routes the confirm back to the draft", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.toggle")
		const eraseIndex = session.panelFiltered.value.findIndex((op) => op.name === "erase")
		session.dispatch("panel.setOp", { index: eraseIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
		expect(session.confirm.value.text).toContain("erase")
		await session.dispatch("confirm.yes")
		expect(await fs.readDir("/home")).toHaveLength(1)
	})

	test("typing a query filters the operations and anchors the cursor", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "edit" })
		expect(session.panelFiltered.value.map((op) => op.name)).toEqual(["edit"])
		expect(session.panelOpIndex.value).toBe(0)
		expect(session.panelOperation.value.name).toBe("edit")
		// The draft re-binds to the new operation's arguments.
		expect(session.panelDraft.value.map((b) => b.name)).toEqual(["PATH"])
	})

	test("panel.tab cycles the focus ring from the command through the arguments", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// The default operation is `copy`; two argument headers: FROM (row 0,
		// then its item at row 1), then TO (row 2).
		expect(session.panelOperation.value.name).toBe("copy")
		expect(session.panelFocus.value).toBe("ops")
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(0)
		session.dispatch("panel.tab", { delta: 1 })
		// The next header is TO (index 2), skipping the FROM item row.
		expect(session.panelRowIndex.value).toBe(2)
		session.dispatch("panel.tab", { delta: 1 })
		// Past the last header: wrap back to the command column.
		expect(session.panelFocus.value).toBe("ops")
		// Shift-Tab from the command wraps to the last argument header.
		session.dispatch("panel.tab", { delta: -1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(2)
	})
})
