import { describe, expect, test } from "bun:test"
import { createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession, load } from "../../src/js/tcmd/core/session.js"
import { getCommand, getCommandBarItems, getCommands, getModifierBarItems } from "../../src/js/tcmd/core/commands.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
}

function makeSession() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	// The commander-specific tests opt in; the session now opens in explorer.
	return createSession({ fs, left, right, viewMode: "commander" })
}

describe("commands", () => {
	test("registry is well-formed", () => {
		for (const command of getCommands()) {
			expect(command.id.length).toBeGreaterThan(0)
			expect(typeof command.run).toBe("function")
		}
		expect(getCommand("nav.up").title).toBeTruthy()
		expect(getCommand("nope")).toBeNull()
	})

	test("nav.down moves the active pane cursor", async () => {
		const session = makeSession()
		await load(session)
		expect(session.active.value).toBe("left")
		expect(session.panes.left.cursor.value).toBe(0)
		session.dispatch("nav.down")
		expect(session.panes.left.cursor.value).toBe(1)
	})

	test("nav.jumpDown/jumpUp move the cursor by a few lines, clamped", async () => {
		const fs = createMockFs({
			"/": [{ name: "many", isDir: true }],
			"/many": Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.txt` })),
		})
		const session = createSession({
			fs,
			left: createPane({ fs, path: "/many" }),
			right: createPane({ fs, path: "/" }),
		})
		await load(session)
		session.dispatch("nav.jumpDown")
		expect(session.panes.left.cursor.value).toBe(5)
		session.dispatch("nav.jumpDown")
		expect(session.panes.left.cursor.value).toBe(10)
		session.dispatch("nav.jumpDown") // clamps at the last entry
		expect(session.panes.left.cursor.value).toBe(11)
		session.dispatch("nav.jumpUp")
		expect(session.panes.left.cursor.value).toBe(6)
		session.dispatch("nav.jumpUp") // clamps at the first entry
		session.dispatch("nav.jumpUp")
		session.dispatch("nav.jumpUp")
		expect(session.panes.left.cursor.value).toBe(0)
	})

	test("pane.toggle switches the active pane", async () => {
		const session = makeSession()
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("right")
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("left")
	})

	test("pane.enter descends into the directory under the cursor", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.enter")
		await Promise.resolve()
		expect(session.panes.left.path.value).toBe("/home/tester")
	})

	test("pane.enter edits a text file when the host has an editor", async () => {
		const fs = createMockFs(TREE)
		const edits = []
		const os = {
			canEdit: true,
			edit: async (path) => {
				edits.push(path)
			},
		}
		const session = createSession({
			fs,
			os,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "commander",
		})
		await load(session)
		// `tester/` is first; the cursor lands on it. Move to `notes.txt`.
		const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
		session.panes.left.cursor.set(index)
		await session.dispatch("pane.enter")
		expect(edits).toEqual(["/home/notes.txt"])
		// Editing is not a preview: the fullscreen inspector stays closed.
		expect(session.viewerOpen.value).toBe(false)
	})

	test("pane.enter previews a non-editable file fullscreen", async () => {
		const fs = createMockFs({
			"/": [{ name: "home", isDir: true }],
			"/home": [{ name: "photo.png", text: "\u0089PNG", size: 4 }],
		})
		// A host with an editor still previews a kind it cannot edit.
		const os = {
			canEdit: true,
			edit: async () => {
				throw new Error("should not edit an image")
			},
		}
		const session = createSession({
			fs,
			os,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "commander",
		})
		await load(session)
		session.panes.left.cursor.set(0)
		await session.dispatch("pane.enter")
		expect(session.viewerOpen.value).toBe(true)
		expect(session.previewTarget.value?.path).toBe("/home/photo.png")
		expect(session.showPreview.value).toBe(true)
	})

	test("pane.enter previews a file fullscreen on a host without an editor", async () => {
		// The default (null) host reports `canEdit: false`, as the web does.
		const session = makeSession()
		await load(session)
		const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
		session.panes.left.cursor.set(index)
		await session.dispatch("pane.enter")
		expect(session.viewerOpen.value).toBe(true)
		expect(session.previewTarget.value?.path).toBe("/home/notes.txt")
	})

	test("view.toggleViewer opens and closes the fullscreen inspector", async () => {
		const session = makeSession()
		expect(session.viewerOpen.value).toBe(false)
		await session.dispatch("view.toggleViewer")
		expect(session.viewerOpen.value).toBe(true)
		await session.dispatch("view.toggleViewer")
		expect(session.viewerOpen.value).toBe(false)
	})

	test("pane.up returns to the parent", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.enter")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		session.dispatch("pane.up")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
	})

	test("pane.back and pane.forward walk the pane history", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("pane.back") // nothing recorded yet
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")

		session.dispatch("pane.enter") // /home -> /home/tester
		await new Promise((resolve) => setTimeout(resolve, 0))
		session.dispatch("pane.up") // /home/tester -> /home
		await new Promise((resolve) => setTimeout(resolve, 0))

		session.dispatch("pane.back")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		session.dispatch("pane.forward")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
	})

	test("list.mark toggles the mark under the cursor", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("list.mark")
		expect(session.panes.left.marked.value.size).toBe(1)
	})

	test("list.cursor activates the clicked pane", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("list.cursor", { paneId: "right", index: 0 })
		expect(session.active.value).toBe("right")
		expect(session.panes.right.cursor.value).toBe(0)
	})

	test("pane.activate switches the active pane and ignores unknown ids", () => {
		const session = makeSession()
		session.dispatch("pane.activate", { paneId: "right" })
		expect(session.active.value).toBe("right")
		session.dispatch("pane.activate", { paneId: "middle" })
		expect(session.active.value).toBe("right")
	})

	test("view.togglePreview flips showPreview", async () => {
		const session = makeSession()
		session.dispatch("view.togglePreview")
		expect(session.showPreview.value).toBe(false)
	})

	test("file.edit warns instead of tripping over a host without an editor", async () => {
		// The default (null) host reports `canEdit: false`, as the web does; the
		// command reports it rather than letting `edit` throw.
		const session = makeSession()
		await load(session)
		const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
		session.panes.left.cursor.set(index)
		await session.dispatch("file.edit")
		expect(session.notice.value).toEqual({ kind: "warning", text: "no editor available" })
	})

	test("view.maximize toggles the maximized inspector", () => {
		const session = makeSession()
		expect(session.previewFull.value).toBe(false)
		session.dispatch("view.maximize")
		expect(session.previewFull.value).toBe(true)
		// Toggling back leaves the rest of the view state untouched.
		expect(session.showPreview.value).toBe(true)
		session.dispatch("view.maximize")
		expect(session.previewFull.value).toBe(false)
	})

	test("view.toggleMode flips between the commander and the explorer", async () => {
		const session = makeSession()
		await load(session)
		expect(session.viewMode.value).toBe("commander")
		session.dispatch("view.toggleMode")
		expect(session.viewMode.value).toBe("explorer")
		session.dispatch("view.toggleMode")
		expect(session.viewMode.value).toBe("commander")
	})

	// A session over a tree with sibling directories, so the parent column
	// has something to descend into other than the pane it follows — and the
	// directory it mirrors is not the first entry, so a cursor that lands on
	// it cannot pass by accident at the top of the listing.
	function makeExplorerSession() {
		const fs = createMockFs({
			"/": [{ name: "work", isDir: true }],
			"/work": [
				{ name: "archive", isDir: true },
				{ name: "docs", isDir: true },
				{ name: "src", isDir: true },
				{ name: "readme.md", text: "root readme", size: 11 },
			],
			"/work/archive": [{ name: "old.txt", text: "old", size: 3 }],
			"/work/docs": [{ name: "a.txt", text: "a", size: 1 }],
			"/work/src": [{ name: "b.txt", text: "b", size: 1 }],
		})
		return createSession({ fs, left: createPane({ fs, path: "/work/docs" }), right: createPane({ fs, path: "/" }) })
	}

	test("the explorer's parent column mirrors the current directory", async () => {
		const session = makeExplorerSession()
		await load(session)
		expect(session.panes.parent.path.value).toBe("/work")
		// Descending keeps the mirror on the new parent.
		await session.panes.left.navigate("/work/src")
		expect(session.panes.parent.path.value).toBe("/work")
		// Outside explorer the column is not shown and focus is not parked on
		// it either.
		session.dispatch("pane.activate", { paneId: "parent" })
		expect(session.active.value).toBe("parent")
		expect(session.currentId.value).toBe("left")
		session.dispatch("view.toggleMode")
		expect(session.active.value).toBe("left")
	})

	test("opening from the parent column descends the pane it follows", async () => {
		const session = makeExplorerSession()
		await load(session)
		session.dispatch("pane.activate", { paneId: "parent" })
		const index = session.panes.parent.entries.value.findIndex((entry) => entry.name === "src")
		expect(index).toBeGreaterThan(0)
		session.panes.parent.cursor.set(index)
		await session.dispatch("pane.enter")
		expect(session.panes.left.path.value).toBe("/work/src")
		// The mirror stays on the parent of wherever the current pane landed.
		expect(session.panes.parent.path.value).toBe("/work")
		// Stepping up moves the current pane too, never the mirror itself.
		await session.dispatch("pane.up")
		expect(session.panes.left.path.value).toBe("/work")
		expect(session.panes.parent.path.value).toBe("/")
	})

	test("pane.enter and pane.up keep the cursor on the previously selected element", async () => {
		const session = makeExplorerSession()
		await load(session)
		await session.panes.left.navigate("/work")
		// Descending into `src`, then stepping up, returns to `src` — which
		// is not the top of the listing (`archive` sorts first).
		const srcIndex = session.panes.left.entries.value.findIndex((entry) => entry.name === "src")
		expect(srcIndex).toBeGreaterThan(0)
		session.panes.left.cursor.set(srcIndex)
		await session.dispatch("pane.enter")
		expect(session.panes.left.path.value).toBe("/work/src")
		await session.dispatch("pane.up")
		expect(session.panes.left.path.value).toBe("/work")
		expect(session.panes.left.currentEntry()?.name).toBe("src")
		// The round trip repeats with the same result.
		await session.dispatch("pane.enter")
		await session.dispatch("pane.up")
		expect(session.panes.left.currentEntry()?.name).toBe("src")
		expect(session.panes.left.cursor.value).toBe(srcIndex)
	})

	test("the explorer's parent column keeps its cursor on the current directory", async () => {
		const session = makeExplorerSession()
		await load(session)
		const parentCursorName = () => session.panes.parent.currentEntry()?.name
		expect(session.panes.parent.path.value).toBe("/work")
		// The mirror opens with its cursor on the directory the pane shows.
		expect(parentCursorName()).toBe("docs")
		// Descending moves the mirror's cursor along with the current pane.
		await session.panes.left.navigate("/work/src")
		expect(parentCursorName()).toBe("src")
		// Stepping up carries the mirror to the grandparent, cursor on `work`.
		await session.dispatch("pane.up")
		expect(session.panes.parent.path.value).toBe("/")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(parentCursorName()).toBe("work")
	})

	test("mirroring the parent column never records its history", async () => {
		const session = makeExplorerSession()
		await load(session)
		const depth = session.panes.parent.history.stack.length
		await session.panes.left.navigate("/work/src")
		expect(session.panes.parent.path.value).toBe("/work")
		expect(session.panes.parent.history.stack.length).toBe(depth)
	})

	test("clicking a parent directory makes it the current directory", async () => {
		const session = makeExplorerSession()
		await load(session)
		const index = session.panes.parent.entries.value.findIndex((entry) => entry.name === "src")
		await session.dispatch("list.cursor", { paneId: "parent", index })
		await new Promise((resolve) => setTimeout(resolve, 0))
		// A directory click descends the pane the mirror follows, and the
		// focus stays on the column that was clicked.
		expect(session.panes.left.path.value).toBe("/work/src")
		expect(session.active.value).toBe("parent")
		expect(session.panes.parent.path.value).toBe("/work")
		expect(session.panes.parent.currentEntry()?.name).toBe("src")
	})

	test("clicking a parent file opens its directory and selects the file", async () => {
		const session = makeExplorerSession()
		await load(session)
		const index = session.panes.parent.entries.value.findIndex((entry) => entry.name === "readme.md")
		await session.dispatch("list.cursor", { paneId: "parent", index })
		await new Promise((resolve) => setTimeout(resolve, 0))
		// A file cannot be current: its directory becomes current, the file is
		// selected there, and the mirror steps up to that directory's parent.
		expect(session.panes.left.path.value).toBe("/work")
		expect(session.panes.left.currentEntry()?.name).toBe("readme.md")
		expect(session.active.value).toBe("parent")
		expect(session.panes.parent.path.value).toBe("/")
	})

	test("clicking an item in the preview promotes the previewed directory", async () => {
		const session = makeExplorerSession()
		await load(session)
		// Put the current pane at /work with `docs` under the cursor, so the
		// inspector previews `/work/docs` as a directory pane.
		await session.panes.left.navigate("/work")
		const docsIndex = session.panes.left.entries.value.findIndex((entry) => entry.name === "docs")
		session.panes.left.cursor.set(docsIndex)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.previewEntry.value?.isDir).toBe(true)
		// Clicking a row of the previewed directory makes it current and
		// selects the clicked entry, without stealing focus.
		await session.dispatch("list.cursor", { paneId: "preview", index: 0 })
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/work/docs")
		expect(session.panes.left.currentEntry()?.name).toBe("a.txt")
		expect(session.active.value).toBe("preview")
	})

	test("back restores the focused column that initiated the move", async () => {
		const session = makeExplorerSession()
		await load(session)
		session.dispatch("pane.activate", { paneId: "parent" })
		const index = session.panes.parent.entries.value.findIndex((entry) => entry.name === "src")
		session.panes.parent.cursor.set(index)
		await session.dispatch("pane.enter")
		expect(session.panes.left.path.value).toBe("/work/src")
		// The user focuses the child to keep exploring, then steps back.
		session.dispatch("pane.activate", { paneId: "left" })
		await session.dispatch("pane.back")
		expect(session.panes.left.path.value).toBe("/work/docs")
		// The column that initiated the move gets focus back.
		expect(session.active.value).toBe("parent")
	})

	test("filter.start stays on a column with a filter field and falls back otherwise", async () => {
		const session = makeExplorerSession()
		await load(session)
		// The parent column is a full pane: it keeps focus and its own filter.
		session.dispatch("pane.activate", { paneId: "parent" })
		session.dispatch("filter.start")
		expect(session.active.value).toBe("parent")
		expect(session.filtering.value).toBe("parent")
		// The inspector column has no filter field: focus goes back to the
		// pane it shows before keystrokes are captured.
		session.dispatch("pane.activate", { paneId: "preview" })
		session.dispatch("filter.start")
		expect(session.active.value).toBe("left")
		expect(session.filtering.value).toBe("left")
	})

	test("pane.toggle cycles the columns the current view mode shows", async () => {
		const session = makeExplorerSession()
		await load(session)
		// Explorer (the opening mode), rightward with a wrap: current →
		// preview → parent → current.
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("preview")
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("parent")
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("left")

		session.dispatch("view.toggleMode")
		// Commander: source ⇄ destination.
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("right")
		session.dispatch("pane.toggle")
		expect(session.active.value).toBe("left")
	})

	test("unknown commands are ignored", () => {
		const session = makeSession()
		expect(session.dispatch("nope")).toBeNull()
	})

	test("the command bar marks the Open action as primary", () => {
		const items = getCommandBarItems({ filtering: null, bookmarkOpen: false, bookmarkMode: "list", panelOpen: false })
		const open = items.find((item) => item.id === "pane.enter")
		expect(open.primary).toBe(true)
		const others = items.filter((item) => item.id && item.id !== "pane.enter")
		expect(others.every((item) => item.primary !== true)).toBe(true)
		// The panel is the command entry point, so it is on the bar; the
		// palette it replaced is gone.
		expect(items.some((item) => item.id === "panel.open")).toBe(true)
		expect(items.some((item) => item.id === "panel.toggle")).toBe(false)
	})

	test("the bar carries the `?` reference and reveals modifier chords", () => {
		const items = getCommandBarItems({ filtering: null, bookmarkOpen: false, bookmarkMode: "list", panelOpen: false })
		expect(items.some((item) => item.id === "app.help")).toBe(true)

		const shift = getModifierBarItems("shift").map((item) => item.id)
		expect(shift).toContain("view.maximize")
		expect(shift).toContain("file.open")
		expect(shift).toContain("pane.toggle")
		expect(shift).toContain("app.help")
		expect(getModifierBarItems("shift").find((item) => item.id === "pane.toggle").keys).toBe("⇧Tab")
		// Only the modifier's own chords replace the default hints.
		expect(shift).not.toContain("pane.enter")

		const ctrl = getModifierBarItems("ctrl").map((item) => item.id)
		expect(ctrl).toContain("pane.reload")
		expect(ctrl).toContain("nav.jumpUp")
		expect(ctrl).not.toContain("view.maximize")
	})

	test("the held modifier swaps the session's bar items", () => {
		const session = makeSession()
		expect(session.commandBarItems.value.some((item) => item.id === "app.help")).toBe(true)
		session.barModifier.set("ctrl")
		const ids = session.commandBarItems.value.map((item) => item.id)
		expect(ids).toContain("pane.reload")
		expect(ids).not.toContain("pane.enter")
		// An overlay that owns the keyboard still wins over the modifier.
		session.panelOpen.set(true)
		expect(session.commandBarItems.value.map((item) => item.title)).toContain("Command")
	})

	test("failures land on the active pane error", async () => {
		const session = makeSession()
		session.active.set("right")
		const command = getCommand("pane.reload")
		const original = command.run
		command.run = () => {
			throw new Error("boom")
		}
		try {
			await session.dispatch("pane.reload")
			expect(session.panes.right.error.value).toBe("boom")
			expect(session.panes.left.error.value).toBeNull()
		} finally {
			command.run = original
		}
	})
})
