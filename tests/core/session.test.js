import { describe, expect, test } from "bun:test"
import { gzipSync } from "node:zlib"
import { PANE_BUFFERS, PANE_LABELS, createPane } from "../../src/js/tcmd/core/pane.js"
import { createSession, load } from "../../src/js/tcmd/core/session.js"
import { createMockFs } from "../helpers/mock-fs.js"

// "hello from bzip2\ncafé second line\n", compressed with `bzip2 -c`.
const BZIP2_FIXTURE = Uint8Array.from(
	Buffer.from(
		"QlpoOTFBWSZTWeweYXcAAAjZlAAQQAAQAD9n2BAAIAgAIAAijIMhoNqCgaaGRkxCtnSjmFVOQfdGr0TQ2g5DJiw8fxdyRThQkOweYXc=",
		"base64",
	),
)
const BZIP2_TEXT = "hello from bzip2\ncafé second line\n"

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
	// These tests exercise the commander workspace; the session opens in
	// explorer now (see the default-mode test below).
	return createSession({ fs, left, right, host: "box", viewMode: "commander" })
}

describe("session", () => {
	test("server token is a read-only panel value only while the server runs", () => {
		const fs = createMockFs(TREE)
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/" }), server: true })
		expect(session.panelEntries.value.some((entry) => entry.showToken)).toBe(false)
		session.webServer.set({ mode: "local", url: "http://127.0.0.1:8787", token: "secret-token" })
		session.dispatch("panel.open")
		session.panelQuery.set("server token")
		expect(session.panelEntry.value.name).toBe("server token")
		expect(session.panelRows.value[0]).toMatchObject({
			name: "TOKEN", value: "secret-token", summary: "secret-token", readonly: true, textual: false,
		})
		session.webServer.set(null)
		expect(session.panelEntries.value.some((entry) => entry.showToken)).toBe(false)
		expect(JSON.stringify(session.panelRows.value)).not.toContain("secret-token")
	})

	test("opens in explorer mode by default", () => {
		const fs = createMockFs(TREE)
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/" }) })
		expect(session.viewMode.value).toBe("explorer")
		// A caller can still ask for the two-pane commander.
		const commander = createSession({
			fs,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "commander",
		})
		expect(commander.viewMode.value).toBe("commander")
	})

	test("auto-refresh only follows the columns the view shows", () => {
		const fs = createMockFs(TREE)
		const session = createSession({
			fs,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
		})
		// Explorer: parent, the current source/destination pane, and the
		// inspector. The other pane is not rendered, so it does not watch.
		expect(session.panes.parent.autoRefresh.value).toBe(true)
		expect(session.panes.left.autoRefresh.value).toBe(true)
		expect(session.panes.right.autoRefresh.value).toBe(false)
		expect(session.panes.preview.autoRefresh.value).toBe(true)
		expect(session.pickerPane.autoRefresh.value).toBe(false)

		session.active.set("right")
		expect(session.panes.right.autoRefresh.value).toBe(true)
		expect(session.panes.left.autoRefresh.value).toBe(false)

		session.viewMode.set("commander")
		expect(session.panes.left.autoRefresh.value).toBe(true)
		expect(session.panes.right.autoRefresh.value).toBe(true)
		expect(session.panes.parent.autoRefresh.value).toBe(false)

		session.showPreview.set(false)
		expect(session.panes.preview.autoRefresh.value).toBe(false)

		session.pickerOpen.set(true)
		expect(session.pickerPane.autoRefresh.value).toBe(true)
		session.pickerOpen.set(false)
		expect(session.pickerPane.autoRefresh.value).toBe(false)
	})

	test("tracks the host and the active pane's directory for the header", async () => {
		const session = makeSession()
		await load(session)
		expect(session.host).toBe("box")
		expect(session.activePath.value).toBe("/home")
		session.dispatch("pane.toggle")
		expect(session.activePath.value).toBe("/")
		await session.panes.right.navigate("/home/tester")
		expect(session.activePath.value).toBe("/home/tester")
	})

	test("preview follows the active pane cursor entry", async () => {
		const session = makeSession()
		await load(session)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.preview.value).toBeNull()
		session.dispatch("nav.down")
		await new Promise((resolve) => setTimeout(resolve, 0))
		const preview = session.preview.value
		expect(preview.kind).toBe("text")
		expect(preview.title).toBe("notes.txt")
		expect(preview.text).toContain("hello")
	})

	test("previews gzip and bzip2 entries by decompressing their head", async () => {
		const fixtures = {
			"notes.txt.gz": { bytes: gzipSync("hello from gzip\n"), compression: "gzip" },
			"notes.txt.bz2": { bytes: BZIP2_FIXTURE, compression: "bzip2" },
		}
		for (const [name, fixture] of Object.entries(fixtures)) {
			const fs = createMockFs({
				"/": [{ name: "home", isDir: true }],
				"/home": [{ name, bytes: fixture.bytes, size: fixture.bytes.length }],
			})
			const session = createSession({
				fs,
				left: createPane({ fs, path: "/home" }),
				right: createPane({ fs, path: "/" }),
				viewMode: "commander",
			})
			await load(session)
			await new Promise((resolve) => setTimeout(resolve, 0))
			const preview = session.preview.value
			expect(preview.kind).toBe("text")
			expect(preview.text).toBe(name.endsWith(".gz") ? "hello from gzip\n" : BZIP2_TEXT)
			expect(preview.ext).toBe(name.split(".").at(-1))
			expect(preview.innerExt).toBe("txt")
			expect(preview.compression).toBe(fixture.compression)
			expect(preview.title).toBe(name)
		}
	})

	test("a compressed body that decompresses to binary stays a card", async () => {
		const tar = Buffer.from([0x61, 0x2e, 0x74, 0x78, 0x74, 0x00, 0x00, 0x00])
		const fs = createMockFs({
			"/": [{ name: "home", isDir: true }],
			"/home": [{ name: "archive.tar.gz", bytes: gzipSync(tar), size: 40 }],
		})
		const session = createSession({
			fs,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "commander",
		})
		await load(session)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.preview.value.kind).toBe("text")
		expect(session.preview.value.text).toBeNull()
		expect(session.preview.value.innerExt).toBe("tar")
	})

	test("command bar follows the focused workspace column, then the panel hints", () => {
		const session = makeSession()
		const ids = session.commandBarItems.value.map((item) => item.id)
		expect(ids).toEqual([
			"panel.open",
			"pane.enter",
			"list.mark",
			"filter.start",
			"pane.toggle",
			"view.togglePreview",
			"app.help",
			"bookmark.open",
			"view.toggleMode",
		])
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual([
			"Commands",
			"Open",
			"Mark",
			"Filter",
			"Switch",
			"Preview",
			"Help",
			"Bookmarks",
			"Toggle Mode",
		])
		expect(ids).not.toContain("nav.up")
		expect(ids).toContain("pane.enter")

		session.panelOpen.set(true)
		const hints = session.commandBarItems.value.map((item) => item.title)
		expect(hints).toEqual(["Command", "Arg", "Browse", "Toggle", "Run", "Close"])
		// The picker sub-mode swaps in its own hints.
		session.pickerOpen.set(true)
		const picker = session.commandBarItems.value.map((item) => item.title)
		expect(picker).toContain("Go")
	})

	test("the command bar follows the full preview mode and its content", async () => {
		const session = makeSession()
		await load(session)
		// The cursor starts on `tester/`: the inspector renders a directory
		// column, and the full previews switch to listing navigation.
		expect(session.previewDirectory.value).toBe(true)
		session.viewerOpen.set(true)
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual(["Row", "Open", "Parent", "Mark", "Close"])
		// The listing keys keep their chords, so a bar click is not the only way.
		expect(session.commandBarItems.value.find((item) => item.id === "list.mark")?.keys).toBe("Spc")
		expect(session.commandBarItems.value.find((item) => item.id === "pane.enter")?.keys).toBe("→/Enter")
		session.viewerOpen.set(false)
		session.previewFull.set(true)
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual(["Row", "Open", "Parent", "Mark", "Restore"])
		session.previewFull.set(false)

		// A file preview scrolls and steps through its neighbours instead. Open
		// and Edit advertise the keymap's own chords in both full views.
		session.panes.left.cursor.set(1)
		expect(session.previewDirectory.value).toBe(false)
		session.viewerOpen.set(true)
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual(["Scroll", "Prev", "Next", "Open", "Edit", "Close"])
		expect(session.commandBarItems.value.find((item) => item.id === "file.open")?.keys).toBe("⇧O")
		expect(session.commandBarItems.value.find((item) => item.id === "file.edit")?.keys).toBe("⇧E")
		session.viewerOpen.set(false)
		session.previewFull.set(true)
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual(["Scroll", "Prev", "Next", "Open", "Edit", "Restore"])
		expect(session.commandBarItems.value.find((item) => item.id === "file.open")?.keys).toBe("⇧O")
		expect(session.commandBarItems.value.find((item) => item.id === "file.edit")?.keys).toBe("⇧E")
	})

	test("the command bar follows the parent and inspector focus", async () => {
		const fs = createMockFs(TREE)
		const session = createSession({
			fs,
			left: createPane({ fs, path: "/home" }),
			right: createPane({ fs, path: "/" }),
			viewMode: "explorer",
		})
		await load(session)
		session.active.set("parent")
		// Every workspace column keeps the panel entry point (`:`).
		expect(session.commandBarItems.value.map((item) => item.title)).toContain("Parent")
		expect(session.commandBarItems.value.map((item) => item.title)).toContain("Commands")

		// Focused on the inline inspector over a directory: a listing, so it
		// keeps Mark/Filter-like actions and the panel.
		session.active.set("preview")
		expect(session.previewColumn.value).toBe(true)
		const directoryTitles = session.commandBarItems.value.map((item) => item.title)
		expect(directoryTitles).toEqual(["Commands", "Open", "Parent", "Mark", "Switch", "Hide", "Maximize", "Help", "Bookmarks", "Toggle Mode"])
		expect(session.commandBarItems.value.find((item) => item.id === "list.mark")?.keys).toBe("Spc")

		// Focused on the inline inspector over a file: a card, no listing.
		session.panes.left.cursor.set(1)
		expect(session.previewColumn.value).toBe(false)
		const fileTitles = session.commandBarItems.value.map((item) => item.title)
		expect(fileTitles).toContain("Open")
		expect(fileTitles).toContain("Edit")
		expect(fileTitles).toContain("Maximize")
		expect(fileTitles).toContain("Commands")
		expect(fileTitles).not.toContain("Mark")
	})

	test("the confirm dialog owns the command bar hints", () => {
		const session = makeSession()
		session.confirm.set({ text: "erase?" })
		expect(session.commandBarItems.value.map((item) => item.title)).toEqual(["Yes", "No"])
	})

	test("the panel lists categorized name-only operations and the view command", () => {
		const session = makeSession()
		const items = session.panelItems.value
		const entries = items.filter((item) => item.type === "op")
		expect(entries.map((item) => item.name)).toEqual([
			"bookmark", "quit", "reload", "screenshot", "view",
			"abspath", "open", "realpath", "run", "view",
			"df", "du", "file", "stat",
			"mkdir", "new",
			"chmod", "chown", "copy", "edit", "hardlink", "move", "rename", "replace", "symlink", "touch",
			"delete", "erase", "unlink",
		])
		expect(items.filter((item) => item.type === "group").map((item) => item.name)).toEqual([
			"Command", "File", "Info", "Create", "Edit", "Delete",
		])
		expect(entries.every((item) => item.summary === undefined)).toBe(true)
		expect(entries.some((item) => item.key === "command:view")).toBe(true)
		expect(entries.some((item) => item.key === "command:reload")).toBe(true)
	})

	test("the panel filters the operations by query and resets its cursor", () => {
		const session = makeSession()
		session.panelQuery.set("copy")
		const ids = session.panelItems.value.map((item) => item.key)
		expect(ids).toEqual(["group:edit", "op:copy"])

		session.panelOpIndex.set(3)
		session.panelQuery.set("touch")
		expect(session.panelOpIndex.value).toBe(0)
	})

	test("filtering keeps fixed categories instead of relevance-ranking", () => {
		const session = makeSession()
		session.panelQuery.set("op")
		const items = session.panelItems.value
		expect(items.map((item) => item.key)).toEqual(["group:file", "op:open", "group:edit", "op:copy"])
	})

	test("`!` lands on the shell operation with its CMD field focused", () => {
		const session = makeSession()
		session.dispatch("panel.shell")
		expect(session.panelOpen.value).toBe(true)
		expect(session.panelEntry.value.name).toBe("run")
		// The argument pane takes the cursor, on the raw CMD field.
		expect(session.panelFocus.value).toBe("args")
		expect(session.panelTextual.value).toBe(true)
		expect(session.panelRows.value[0].name).toBe("CMD")
		// Selecting by index, not by query: the filter stays empty.
		expect(session.panelQuery.value).toBe("")
	})

	test("filesets expose the two pane buffers and the preview file", async () => {
		const session = makeSession()
		await load(session)
		// Cursors start on directories and no pane is marked: only $FILE.
		expect(session.filesets.value).toEqual([])

		session.panes.left.cursor.set(1) // notes.txt
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$FILE"])
		expect(session.filesets.value[0].paths).toEqual(["/home/notes.txt"])

		session.dispatch("list.mark")
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$A", "$FILE"])

		session.dispatch("pane.toggle")
		session.dispatch("list.mark") // marks /home in the right pane
		expect(session.filesets.value.map((set) => set.id)).toEqual(["$A", "$B"])
	})

	test("b opens the panel with an add row for the cursor entry", async () => {
		const session = makeSession()
		await load(session)
		session.panes.left.cursor.set(1) // notes.txt
		session.dispatch("bookmark.open")
		expect(session.bookmarkOpen.value).toBe(true)
		expect(session.bookmarkQuery.value).toBe("")
		expect(session.bookmarkTarget.value).toEqual({ path: "/home/notes.txt", isDir: false })
		expect(session.bookmarkItems.value).toEqual([
			{ key: "+ add current path", add: true, name: "+ add current path", path: "/home/notes.txt", isDir: false },
		])
	})

	test("the add row tracks the directory kind for a directory entry", async () => {
		const session = makeSession()
		await load(session)
		session.panes.left.cursor.set(0) // tester/ directory
		session.dispatch("bookmark.open")
		expect(session.bookmarkTarget.value).toEqual({ path: "/home/tester", isDir: true })
		expect(session.bookmarkItems.value[0]).toMatchObject({ add: true, path: "/home/tester", isDir: true })
	})

	test("activating the add row records the path under its basename", async () => {
		const session = makeSession()
		await load(session)
		session.panes.left.cursor.set(1) // notes.txt
		session.dispatch("bookmark.open")
		await session.dispatch("bookmark.select")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.bookmarks.entries.value).toEqual({
			"notes.txt": { path: "/home/notes.txt", isDir: false },
		})
		expect(session.bookmarkOpen.value).toBe(false)
		expect(session.notice.value.text).toBe("bookmarked notes.txt")
	})

	test("a path that is already bookmarked gets no add row", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.panes.left.cursor.set(1) // notes.txt
		session.dispatch("bookmark.open")
		expect(session.bookmarkOpen.value).toBe(true)
		expect(session.bookmarkItems.value).toEqual([
			{ key: "notes", name: "notes", path: "/home/notes.txt", isDir: false },
		])
	})

	test("opening a directory bookmark opens it", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("tester", "/home/tester", true)
		session.dispatch("bookmark.open")
		expect(session.bookmarkOpen.value).toBe(true)
		expect(session.bookmarkItems.value).toEqual([
			{ key: "tester", name: "tester", path: "/home/tester", isDir: true },
		])
		await session.dispatch("bookmark.select")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home/tester")
		expect(session.bookmarkOpen.value).toBe(false)
	})

	test("opening a file bookmark selects and previews it", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.dispatch("bookmark.open")
		// The filter hides the add row so the first row is the bookmark.
		session.bookmarkQuery.set("notes")
		await session.dispatch("bookmark.select")
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.panes.left.path.value).toBe("/home")
		expect(session.panes.left.currentEntry().path).toBe("/home/notes.txt")
		expect(session.showPreview.value).toBe(true)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.preview.value?.title).toBe("notes.txt")
	})

	test("the filter fuzzy-matches bookmarks by name and path", async () => {
		const session = makeSession()
		await load(session)
		await session.bookmarks.record("home", "/home", true)
		await session.bookmarks.record("notes", "/home/notes.txt", false)
		session.dispatch("bookmark.open")
		session.bookmarkQuery.set("notes")
		expect(session.bookmarkItems.value.map((row) => row.name)).toEqual(["notes"])
		// A path-only match still finds the bookmark.
		session.bookmarkQuery.set("notes.txt")
		expect(session.bookmarkItems.value.map((row) => row.name)).toEqual(["notes"])
		// With no query the add row leads the list.
		session.bookmarkQuery.set("")
		expect(session.bookmarkItems.value[0].add).toBe(true)
	})

	test("the preview column mirrors the previewed directory", async () => {
		const session = makeSession()
		await load(session)
		await new Promise((resolve) => setTimeout(resolve, 0))
		// The cursor starts on the `tester/` directory, so the third column
		// lists it rather than showing a card.
		expect(session.previewEntry.value?.isDir).toBe(true)
		expect(session.panes.preview.path.value).toBe("/home/tester")
		// Moving onto a file stops the column from following, but does not
		// clear the directory it was showing.
		session.panes.left.cursor.set(1)
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(session.previewEntry.value?.isDir).toBe(false)
		expect(session.panes.preview.path.value).toBe("/home/tester")
	})

	test("focus on an auxiliary column keeps the header on the current directory", async () => {
		const session = makeSession()
		await load(session)
		session.dispatch("view.toggleMode")
		session.dispatch("pane.activate", { paneId: "parent" })
		expect(session.active.value).toBe("parent")
		expect(session.currentId.value).toBe("left")
		expect(session.activePath.value).toBe("/home")
		expect(session.previewEntry.value).toEqual(session.leftCursorEntry.value)
	})

	test("the preview follows symlinks to their target", async () => {
		const fs = createMockFs({
			"/": [{ name: "home", isDir: true }],
			"/home": [
				{ name: "real-dir", isDir: true },
				{ name: "notes.txt", text: "real content\n", size: 13 },
				{ name: "link.txt", isSymlink: true, target: "notes.txt" },
				{ name: "link-dir", isSymlink: true, target: "real-dir" },
			],
			"/home/real-dir": [{ name: "inside.txt", text: "inside", size: 6 }],
		})
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/" }) })
		await load(session)
		const index = (name) => session.panes.left.entries.value.findIndex((entry) => entry.name === name)
		const flush = async () => {
			for (let i = 0; i < 4; i++) await Promise.resolve()
			await new Promise((resolve) => setTimeout(resolve, 0))
		}

		// A link to a file previews the *target's* content, classified by the
		// target's extension, with the traversal named in the title.
		session.panes.left.cursor.set(index("link.txt"))
		await flush()
		expect(session.previewEntry.value.isSymlink).toBe(true)
		expect(session.preview.value.kind).toBe("text")
		expect(session.preview.value.title).toBe("link.txt -> notes.txt")
		expect(session.preview.value.ext).toBe("txt")
		expect(session.preview.value.text).toContain("real content")

		// A link to a directory previews as a directory: the preview column
		// follows it and lists what it points at.
		session.panes.left.cursor.set(index("link-dir"))
		await flush()
		expect(session.previewEntry.value.isDir).toBe(true)
		expect(session.preview.value).toBeNull()
		expect(session.panes.preview.path.value).toBe("/home/link-dir")
		await flush()
		expect(session.panes.preview.entries.value.map((entry) => entry.name)).toEqual(["inside.txt"])
	})

	test("the identity bar names the current pane's repository", async () => {
		const tree = {
			"/": [{ name: "r", isDir: true }],
			"/r": [
				{ name: "a", isDir: true },
				{ name: "b", isDir: true },
			],
			"/r/a": [{ name: "one.txt", text: "1\n" }],
			"/r/b": [{ name: "two.txt", text: "2\n" }],
		}
		const fs = createMockFs(tree)
		const vcs = {
			async statusFor(path) {
				return path.startsWith("/r")
					? { root: "/r", kind: "git", statuses: new Map() }
					: null
			},
		}
		const left = createPane({ fs, vcs, path: "/r/a" })
		const right = createPane({ fs, vcs, path: "/r/b" })
		const session = createSession({ fs, vcs, left, right, viewMode: "commander" })
		const wait = () => new Promise((resolve) => setTimeout(resolve, 10))
		await load(session)
		await wait()
		expect(session.repoKind.value).toBe("git")
		// The current pane decides: moving the destination out of the
		// repository clears the name when it owns the current directory.
		await right.navigate("/")
		await wait()
		session.active.set("right")
		await wait()
		expect(session.repoKind.value).toBeNull()
		session.active.set("left")
		await wait()
		expect(session.repoKind.value).toBe("git")
	})

	test("pane identity: labels are SRC/DST and buffers A/B", () => {
		expect(PANE_LABELS).toEqual({ left: "SRC", right: "DST" })
		expect(PANE_BUFFERS).toEqual({ left: "A", right: "B" })
	})
})
