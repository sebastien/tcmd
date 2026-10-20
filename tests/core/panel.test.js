import { describe, expect, test } from "bun:test"
import { openPanel } from "../../src/js/tcmd/core/commands.js"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession } from "../../src/js/tcmd/core/session.js"
import {
	PANEL_FOCUS,
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

// The panel entry for a CLI operation name. `sel` is script-only (not in the
// menu), so fall back to the operations registry for it.
function entryFor(name) {
	return panelEntries().find((entry) => entry.name === name) ?? { name, op: getOperation(name) }
}

async function makeSession(viewMode = "commander") {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/tmp" })
	// The panel's `dest` argument binds the DST pane, a commander concept; the
	// explorer's mirrors (`parent`, `preview`) need their own listings too.
	const session = createSession({ fs, left, right, viewMode })
	await Promise.all(Object.values(session.panes).map((pane) => pane.refresh()))
	// Let the explorer's parent-mirror effect land its cursor before a test
	// reads the binding it produces.
	await Promise.resolve()
	return { fs, session }
}

describe("panel", () => {
	test("lists categorized CLI operations and the workspace-view command", () => {
		const entries = panelEntries()
		const names = entries.map((entry) => entry.name)
		expect(names).toContain("copy")
		// `sel` stays available to scripts, but is not offered in the menu.
		expect(names).not.toContain("sel")
		expect(names).toContain("run")
		expect(entries.some((entry) => entry.id === "command:view" && entry.commandId === "view.toggleMode")).toBe(true)
		// CLI entries carry an operation and an args signature.
		for (const entry of entries.filter((entry) => entry.op)) {
			expect(entry.op.args.length).toBeGreaterThan(0)
			expect(entry.id).toBe(`op:${entry.name}`)
		}
	})

	test("filterPanelEntries groups by purpose and alphabetizes within each category", () => {
		const entries = panelEntries()
		// Groups use the fixed Command / File / Create / Edit / Delete order;
		// names are sorted alphabetically within each category.
		expect(filterPanelEntries(entries, "").map((entry) => entry.name)).toEqual(
			[
				"bookmark", "quit", "view",
				"abspath", "open", "realpath", "run", "stat", "view",
				"mkdir", "new",
				"chmod", "chown", "copy", "edit", "hardlink", "move", "rename", "replace", "symlink", "touch",
				"delete", "erase", "unlink",
			],
		)
		// The duplicate `view` names stay in their Command and File categories.
		expect(filterPanelEntries(entries, "view").map((entry) => [entry.group, entry.id])).toEqual([
			["Command", "command:view"],
			["File", "op:view"],
		])
		// Matches retain category order rather than relevance-ranking.
		expect(filterPanelEntries(entries, "op").map((entry) => entry.name)).toEqual(["open", "copy"])
		expect(filterPanelEntries(entries, "edit").map((entry) => entry.name)).toEqual(["edit"])
		// An alias matches (`!` -> run).
		expect(filterPanelEntries(entries, "!").map((entry) => entry.name)).toEqual(["run"])
		// The list no longer exposes or searches argument signatures.
		expect(filterPanelEntries(entries, "buf")).toEqual([])
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

	test("in explorer the selection draws from the focused column, the parent included", async () => {
		const { session } = await makeSession("explorer")
		// Focus the parent mirror: its cursor sits on the current directory, so
		// the argument binds that directory, not the current pane's file.
		session.active.set("parent")
		await Promise.resolve()
		expect(selectedPaths(bindArgs(session, entryFor("delete"))[0])).toEqual(["/home"])
		// Back on the current column: the cursor entry again.
		session.active.set("left")
		await Promise.resolve()
		expect(selectedPaths(bindArgs(session, entryFor("delete"))[0])).toEqual(["/home/docs"])
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
		// Two marked paths: the argument is a list, one header + one item each.
		session.panes.left.marked.set(new Set(["/home/docs", "/home/notes.txt"]))
		const rows = panelRowList(bindArgs(session, entryFor("delete")))
		expect(rows[0].type).toBe("arg")
		expect(rows[0].name).toBe("PATH")
		expect(rows[0].summary).toBe("SRC · 2 selected")
		expect(rows[1].type).toBe("item")
		expect(rows[1].path).toBe("/home/docs")
		expect(rows[1].parent).toBe("/home")
		expect(rows[1].marker).toBe("[x]")
		// A single path is not a list: the header shows the path, read-only.
		session.panes.left.marked.set(new Set())
		const single = panelRowList(bindArgs(session, entryFor("edit")))
		expect(single).toHaveLength(1)
		expect(single[0].readonly).toBe(true)
		expect(single[0].summary).toBe("/home/docs")
	})

	test("chmod binds nine permission checkboxes seeded from the file mode", async () => {
		const { session } = await makeSession()
		// notes.txt is a regular file, so the mock seeds 644.
		session.panes.left.cursor.set(1)
		const draft = bindArgs(session, entryFor("chmod"))
		const mode = draft[0]
		expect(mode.kind).toBe("permissions")
		expect(mode.items.map((item) => item.key)).toEqual([
			"u:r", "u:w", "u:x", "g:r", "g:w", "g:x", "o:r", "o:w", "o:x",
		])
		expect(mode.items.filter((item) => item.selected).map((item) => item.key)).toEqual([
			"u:r", "u:w", "g:r", "o:r",
		])
		expect(argvFor(draft)[0]).toBe("644")
		expect(panelSummary(mode)).toBe("644 · rw-r--r--")
		// Toggling the user's execute bit rebuilds the mode token.
		expect(argvFor(withToggledItem(draft, 0, 2))[0]).toBe("744")
		// PATH comes first, then MODE and one row per permission class.
		const rows = panelRowList(draft)
		expect(rows[0]).toMatchObject({ type: "arg", name: "PATH", summary: "/home/notes.txt" })
		expect(rows[1]).toMatchObject({ type: "arg", name: "MODE", summary: "644 · rw-r--r--" })
		const permRows = rows.filter((row) => row.type === "perm")
		expect(permRows.map((row) => row.label)).toEqual(["user", "group", "other"])
		expect(permRows[0].bits.map((bit) => [bit.id, bit.selected])).toEqual([
			["r", true],
			["w", true],
			["x", false],
		])
	})

	test("new and mkdir show the current PATH above NAME and compose them", async () => {
		const { fs, session } = await makeSession()
		for (const [operation, name] of [["mkdir", "created-dir"], ["new", "created.txt"]]) {
			session.dispatch("panel.open")
			const index = session.panelFiltered.value.findIndex((entry) => entry.name === operation)
			session.dispatch("panel.setOp", { index })
			const draft = session.panelDraft.value
			expect(draft.map((binding) => binding.name)).toEqual(["PATH", "NAME"])
			expect(draft[0].value).toBe("/home")
			expect(session.panelRows.value.slice(0, 2).map((row) => row.name)).toEqual(["PATH", "NAME"])
			session.panelDraft.set(
				draft.map((binding) => (binding.name === "NAME" ? { ...binding, value: name } : binding)),
			)
			await session.dispatch("panel.run")
			const stats = await fs.stat(`/home/${name}`)
			expect(stats?.isDir ?? false).toBe(operation === "mkdir")
			expect(stats).not.toBeNull()
		}
	})

	test("chmod and chown display PATH before their mode/owner argument", async () => {
		const { session } = await makeSession()
		for (const operation of ["chmod", "chown"]) {
			const names = panelRowList(bindArgs(session, entryFor(operation))).map((row) => row.name)
			expect(names.slice(0, 2)).toEqual(["PATH", operation === "chmod" ? "MODE" : "OWNER"])
		}
	})

	test("chmod runs the mode assembled from the permission cells", async () => {
		const { fs, session } = await makeSession()
		session.panes.left.cursor.set(1)
		session.dispatch("panel.open")
		const index = session.panelFiltered.value.findIndex((entry) => entry.name === "chmod")
		session.dispatch("panel.setOp", { index })
		// Focus the user row (PATH header, MODE header, then user), put the
		// bit cursor on x, and toggle it: 744.
		session.dispatch("panel.focusArg")
		session.panelRowIndex.set(2)
		session.panelPermBit.set(2)
		session.dispatch("panel.toggleItem")
		expect(session.panelDraft.value[0].items[2].selected).toBe(true)
		// chmod is amber: the first press prints and arms, the second executes.
		await session.dispatch("panel.run")
		expect(session.panelArmed.value).toBe(true)
		expect(session.panelRows.value.at(-1).command).toBe("chmod 744 /home/notes.txt")
		await session.dispatch("panel.run")
		expect((await fs.stat("/home/notes.txt")).mode & 0o777).toBe(0o744)
	})

	test("editing the draft disarms a pending Confirm", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		const index = session.panelFiltered.value.findIndex((entry) => entry.name === "chmod")
		session.dispatch("panel.setOp", { index })
		await session.dispatch("panel.run")
		expect(session.panelArmed.value).toBe(true)
		// Changing a bit invalidates what was confirmed.
		session.dispatch("panel.focusArg")
		session.panelRowIndex.set(2)
		session.dispatch("panel.toggleItem")
		expect(session.panelArmed.value).toBe(false)
		expect(session.panelRows.value.at(-1)).toMatchObject({ type: "run", name: "Run" })
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
		// Command entries lead the list; `bookmark` is first and its
		// optional NAME before PATH leaves a positional gap until filled.
		expect(session.panelEntry.value.name).toBe("bookmark")
		expect(session.panelCommand.value).toBe("bookmark /home/docs")
		expect(session.panelRunnable.value).toBe(false)
		// Rows contain only command names; group rows show purpose categories.
		const copy = session.panelItems.value.find((item) => item.name === "copy")
		expect(copy.type).toBe("op")
		expect(copy.summary).toBeUndefined()
		expect(session.panelItems.value.filter((item) => item.type === "group").map((item) => item.name)).toEqual([
			"Command", "File", "Create", "Edit", "Delete",
		])
		expect(session.panelItems.value.filter((item) => item.type === "op" && item.group === "Create").map((item) => item.name)).toEqual([
			"mkdir", "new",
		])
		expect(session.panelItems.value.filter((item) => item.type === "op" && item.group === "Edit").map((item) => item.name)).toEqual([
			"chmod", "chown", "copy", "edit", "hardlink", "move", "rename", "replace", "symlink", "touch",
		])
		expect(session.panelItems.value.filter((item) => item.type === "op" && item.group === "Delete").map((item) => item.name)).toEqual([
			"delete", "erase", "unlink",
		])
		expect(session.panelRows.value.at(-1)).toMatchObject({ type: "run", name: "Run" })
	})

	test("running Command/view toggles Explorer and Commander", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setOp", {
			index: session.panelFiltered.value.findIndex((entry) => entry.id === "command:view"),
		})
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(session.viewMode.value).toBe("explorer")
	})

	test("the panel Quit command calls the host hook", async () => {
		const { session } = await makeSession()
		let quits = 0
		session.quit = () => quits++
		session.dispatch("panel.open")
		const index = session.panelFiltered.value.findIndex((entry) => entry.id === "command:quit")
		session.dispatch("panel.setOp", { index })
		await session.dispatch("panel.run")
		expect(quits).toBe(1)
		expect(session.panelOpen.value).toBe(false)
	})

	test("a red run prints the command, arms Confirm, then executes", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.open")
		expect(session.panelOpen.value).toBe(true)
		// The list opens on the first Command entry.
		expect(session.panelEntry.value.name).toBe("bookmark")
		// Toggle the destination op to `delete` and run against the cursor.
		const deleteIndex = session.panelFiltered.value.findIndex((op) => op.name === "delete")
		session.dispatch("panel.setOp", { index: deleteIndex })
		await session.dispatch("panel.run")
		// First press only arms: the command is printed and the button reads
		// Confirm; nothing has been deleted yet.
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelArmed.value).toBe(true)
		expect(session.panelRows.value.at(-1).command).toBe("delete /home/docs")
		expect(session.panelRows.value.at(-1)).toMatchObject({ type: "run", name: "Confirm", armed: true })
		expect(session.commandBarItems.value.some((item) => item.title === "Confirm")).toBe(true)
		expect(await fs.readDir("/home")).toHaveLength(2)
		// Second press executes.
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(await fs.readDir("/home")).toHaveLength(1)
		// The real marks were never touched.
		expect(session.panes.left.marked.value.size).toBe(0)
	})

	test("run on an incomplete command focuses the missing argument", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// `bookmark [NAME] [PATH]`: PATH binds the cursor entry, but the
		// optional NAME before it leaves a positional gap, so the draft is not
		// runnable until NAME is filled.
		const index = session.panelFiltered.value.findIndex((op) => op.name === "bookmark")
		session.dispatch("panel.setOp", { index })
		session.dispatch("panel.focusArg")
		session.panelRowIndex.set(0)
		await session.dispatch("panel.run")
		// Enter does not fail: it moves the cursor onto the missing NAME row.
		expect(session.panelOpen.value).toBe(true)
		expect(session.notice.value).toBe(null)
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRows.value[session.panelRowIndex.value].name).toBe("NAME")
		// Filling the argument makes the draft runnable; running closes the panel.
		session.panelDraft.set(
			session.panelDraft.value.map((binding) =>
				binding.name === "NAME" ? { ...binding, value: "memo" } : binding,
			),
		)
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
	})

	test("panel run errors replace the action with Retry and stay local to the panel", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		const index = session.panelFiltered.value.findIndex((entry) => entry.name === "mkdir")
		session.dispatch("panel.setOp", { index })
		session.panelDraft.set(
			session.panelDraft.value.map((binding) => {
				if (binding.name === "PATH") return { ...binding, value: "/home" }
				if (binding.name === "NAME") return { ...binding, value: "docs" }
				return binding
			}),
		)
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelRunError.value).toBe("already exists: /home/docs")
		expect(session.notice.value).toBeNull()
		expect(session.panelRows.value.at(-1)).toMatchObject({ type: "run", name: "Retry", error: "already exists: /home/docs" })
		expect(session.panelFocus.value).toBe(PANEL_FOCUS.ARGS)
		expect(session.panelCursorRow.value.type).toBe("run")
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

	test("a query that matches no operation leaves an empty list", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "Preview" })
		// The internal TinyCmd actions are not listed, so nothing matches.
		expect(session.panelFiltered.value).toEqual([])
		expect(session.panelEntry.value).toBe(null)
	})

	test("erase uses the panel Confirm instead of the confirm overlay", async () => {
		const { fs, session } = await makeSession()
		session.dispatch("panel.open")
		const eraseIndex = session.panelFiltered.value.findIndex((op) => op.name === "erase")
		session.dispatch("panel.setOp", { index: eraseIndex })
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(true)
		expect(session.confirm.value).toBeNull()
		expect(session.panelArmed.value).toBe(true)
		expect(session.panelRows.value.at(-1).command).toContain("erase /home/docs")
		await session.dispatch("panel.run")
		expect(session.panelOpen.value).toBe(false)
		expect(await fs.readDir("/home")).toHaveLength(1)
	})

	test("an unknown entry name refuses to open rather than silently selecting the first", async () => {
		const { session } = await makeSession()
		// A renamed/removed operation is a caller bug; landing on `open`
		// would hide it behind a plausible-looking panel.
		expect(() => session.dispatch("panel.shell")).not.toThrow()
		expect(session.panelEntry.value.name).toBe("run")
		expect(() => openPanel(session, { name: "no-such-op" })).toThrow(/no entry named "no-such-op"/)
	})

	test("typing a query filters the entries and anchors the cursor", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		session.dispatch("panel.setQuery", { query: "edit" })
		// Only the CLI operation matches (the internal actions are not listed).
		expect(session.panelFiltered.value.map((entry) => entry.name)).toEqual(["edit"])
		expect(session.panelOpIndex.value).toBe(0)
		expect(session.panelEntry.value.name).toBe("edit")
		// The draft re-binds to the new entry's arguments.
		expect(session.panelDraft.value.map((b) => b.name)).toEqual(["PATH"])
	})

	test("panel.tab cycles the focus ring from the filter through the arguments", async () => {
		const { session } = await makeSession()
		session.dispatch("panel.open")
		// Select `copy`: two argument headers, FROM (row 0) then TO (row 1).
		// A single source path is not a list, so FROM has no item rows.
		expect(session.panelEntry.value.name).toBe("bookmark")
		session.dispatch("panel.setOp", { index: session.panelFiltered.value.findIndex((op) => op.name === "copy") })
		expect(session.panelEntry.value.name).toBe("copy")
		expect(session.panelFocus.value).toBe("ops")
		session.dispatch("panel.tab", { delta: 1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(0)
		session.dispatch("panel.tab", { delta: 1 })
		// The next header is TO (index 1).
		expect(session.panelRowIndex.value).toBe(1)
		session.dispatch("panel.tab", { delta: 1 })
		// The Run action follows the last header.
		expect(session.panelRowIndex.value).toBe(2)
		session.dispatch("panel.tab", { delta: 1 })
		// Past Run: wrap back to the filter.
		expect(session.panelFocus.value).toBe("ops")
		// Shift-Tab from the filter wraps to Run.
		session.dispatch("panel.tab", { delta: -1 })
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelRowIndex.value).toBe(2)
	})
})
