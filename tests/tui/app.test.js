import { describe, expect, test } from "bun:test"
import { argvFor } from "../../src/js/tcmd/core/panel.js"
import { makeSetup as makeSetupTui, settle } from "../helpers/tui-setup.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\nthird line\n", size: 26 },
		{ name: "tiny.txt", text: "tiny", size: 4 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

const makeSetup = (width, height, options) => makeSetupTui(TREE, width, height, options)

describe("tui app", () => {
	test("renders the header, both panes and the command bar", async () => {
		const { setup, session } = await makeSetup()
		try {
			const frame = setup.captureCharFrame()
			const lines = frame.split("\n")
			// The identity bar names the app; the panes tile below it.
			expect(lines[0]).toContain("TinyCmd")
			expect(lines[1]).toStartWith("┌")
			expect(frame).toContain("tester")
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("home")
			expect(frame).toContain("etc")
			// Command bar key hints from the contextual workspace set.
			expect(frame).toContain("[Commands :]")
			expect(frame).toContain("[Switch ⇥]")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the identity bar shows the server mode and copies its URL on click", async () => {
		const { setup, session } = await makeSetup(120, 20)
		try {
			const copied = []
			session.os.copy = (text) => {
				copied.push(text)
				return true
			}
			session.webServer.set({ mode: "local", url: "http://127.0.0.1:8787", token: "secret-token" })
			await settle(setup)
			let line = setup.captureCharFrame().split("\n")[0]
			expect(line).toContain("server local http://127.0.0.1:8787")
			expect(line).not.toContain("secret-token")
			// Clicking the address copies it through the host clipboard.
			await setup.mockMouse.click(line.indexOf("http://127.0.0.1:8787"), 0)
			await settle(setup)
			expect(copied).toEqual(["http://127.0.0.1:8787/?token=secret-token"])
			expect(setup.captureCharFrame()).not.toContain("secret-token")
			// LAN shows the machine hostname and its own mode label.
			session.webServer.set({ mode: "lan", url: "http://devbox:8787" })
			await settle(setup)
			line = setup.captureCharFrame().split("\n")[0]
			expect(line).toContain("server lan http://devbox:8787")
			session.webServer.set(null)
			await settle(setup)
			expect(setup.captureCharFrame().split("\n")[0]).not.toContain("server ")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the entry detail renders under the listing", async () => {
		const { setup, session } = await makeSetup()
		try {
			// The cursor starts on `notes.txt` (index 1 after `tester/`).
			session.panes.left.cursor.set(1)
			await settle(setup)
			const detail = setup.captureCharFrame()
			const detailLine = detail.split("\n").find((line) => line.includes("file · 26B"))
			expect(detailLine).toBeDefined()
			expect(detail).toContain("rw-r--r--")
			// The summary counts row is gone from the pane footer.
			expect(detail).not.toContain(" dirs,")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("marks show a selected count in the entry detail", async () => {
		const { setup } = await makeSetup()
		try {
			// Space marks the cursor entry; two marks surface the count.
			setup.mockInput.pressKey(" ")
			await settle(setup)
			setup.mockInput.pressArrow("down")
			await settle(setup)
			setup.mockInput.pressKey(" ")
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("2 selected")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shows a minimum-size hint below the workspace breakpoint", async () => {
		const { setup } = await makeSetup(50, 12)
		try {
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Terminal too small")
			expect(frame).toContain("need 64x16")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("arrow keys move the cursor in the active pane", async () => {
		const { setup, session } = await makeSetup()
		try {
			expect(session.panes.left.cursor.value).toBe(0)
			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.panes.left.cursor.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await settle(setup)
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("tab switches the active pane", async () => {
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
		try {
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("enter opens the directory under the cursor", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.panes.left.path.value).toBe("/home/tester")
			expect(setup.captureCharFrame()).toContain("/home/tester")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("navigation leaves the previous pane frame unchanged until the listing is ready", async () => {
		const { setup, session } = await makeSetup()
		try {
			const pane = session.panes.left
			pane.cursor.set(1)
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 0))
			await settle(setup)
			const before = setup.captureCharFrame()
			const readDir = session.fs.readDir
			let finish
			session.fs.readDir = (path) => path === "/home/tester"
				? new Promise((resolve) => { finish = resolve })
				: readDir(path)
			const navigation = pane.navigate("/home/tester")
			await settle(setup)
			expect(setup.captureCharFrame()).toBe(before)
			finish(await readDir("/home/tester"))
			await navigation
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("/home/tester")
			expect(setup.captureCharFrame()).not.toBe(before)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("preview shows text file content when toggled on", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Cursor on notes.txt (index 1 after dirs).
			setup.mockInput.pressArrow("down")
			await Promise.resolve()
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.preview.value?.kind).toBe("text")
			const frame = setup.captureCharFrame()
			expect(frame).toContain("notes.txt")
			expect(frame).toContain("hello")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the panel opens, filters and runs an operation", async () => {
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("Command ·")

			await setup.mockInput.typeText("touch")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).toEqual(["group:edit", "op:touch"])

			// touch is amber: the first Enter arms Confirm, the second runs.
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelArmed.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("[Confirm]")
			setup.mockInput.pressKey("\r")
			await settle(setup)
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(session.panelOpen.value).toBe(false)
			await new Promise((resolve) => setTimeout(resolve, 2600))
			await settle(setup)
			expect(session.notice.value).toBeNull()
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the panel's server modes start, switch and stop the web server", async () => {
		const { setup, session } = await makeSetup(120, 20)
		try {
			let current = null
			session.toggleServer = async (mode) => {
				if (mode === "stop" || current === mode) {
					current = null
					return null
				}
				current = mode
				return {
					mode,
					url: mode === "lan" ? "http://devbox:8787" : "http://127.0.0.1:8787",
				}
			}
			// Both modes are visible under the server family; the full name
			// narrows to one entry, so `:server local` works as it reads.
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("server")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).toEqual(
				expect.arrayContaining(["command:server-lan", "command:server-local"]),
			)
			await setup.mockInput.typeText(" local")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).toEqual(["group:command", "command:server-local"])
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(current).toBe("local")
			expect(session.webServer.value).toEqual({ mode: "local", url: "http://127.0.0.1:8787" })
			expect(setup.captureCharFrame().split("\n")[0]).toContain("server local http://127.0.0.1:8787")
			// `server lan` switches the running loopback server to the hostname.
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("server lan")
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(current).toBe("lan")
			expect(session.webServer.value).toEqual({ mode: "lan", url: "http://devbox:8787" })
			expect(setup.captureCharFrame().split("\n")[0]).toContain("server lan http://devbox:8787")
			// The explicit stop entry appears only while the server is up and
			// stops it without needing to remember the active mode.
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("server")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).toContain("command:server-stop")
			await setup.mockInput.typeText(" stop")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).toEqual(["group:command", "command:server-stop"])
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(current).toBeNull()
			expect(session.webServer.value).toBeNull()
			expect(setup.captureCharFrame().split("\n")[0]).not.toContain("server ")
			// With the server stopped, the entry is gone from the panel.
			setup.mockInput.pressKey(":")
			await settle(setup)
			await setup.mockInput.typeText("server")
			await settle(setup)
			expect(session.panelItems.value.map((item) => item.key)).not.toContain("command:server-stop")
			setup.mockInput.pressKey("\u001b")
			await settle(setup)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shifted Kitty keys still open commands and invoke shifted bindings", async () => {
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander", kittyKeyboard: true })
		try {
			// A physical Shift-; arrives as the base key `;` plus shifted text
			// `:`. The command panel is bound to the shifted character.
			setup.renderer.stdin.emit("data", Buffer.from("\x1b[59:58;2u"))
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)

			session.dispatch("panel.cancel")
			// Kitty can report shifted letters in uppercase; they still match the
			// lowercase keymap entry with its shift modifier.
			setup.mockInput.pressKey("V", { shift: true })
			await settle(setup)
			expect(session.previewFull.value).toBe(true)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the panel arrows navigate the entries, Tab walks the focus ring", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)

			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.panelOpIndex.value).toBe(1)
			setup.mockInput.pressArrow("up")
			await settle(setup)
			expect(session.panelOpIndex.value).toBe(0)

			// Tab walks the focus ring: the argument headers (NAME then PATH),
			// then back to the filter.
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelRowIndex.value).toBe(0)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelRowIndex.value).toBe(1)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelRowIndex.value).toBe(2)
			setup.mockInput.pressKey("\t")
			await settle(setup)
			expect(session.panelFocus.value).toBe("ops")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the header shows the pane path and b opens the bookmarks panel", async () => {
		const { setup, session } = await makeSetup()
		try {
			// The pane header (the path breadcrumb) sits below the pane's top
			// border — no role label.
			const first = setup.captureCharFrame().split("\n")[2]
			expect(first).toContain("/home")
			expect(first).not.toContain("SRC")
			expect(first).not.toContain("DST")
			expect(first).not.toContain("+")

			// b opens the panel on the cursor entry, offering to add it.
			setup.mockInput.pressArrow("down")
			await settle(setup)
			setup.mockInput.pressKey("b")
			await settle(setup)
			expect(session.bookmarkOpen.value).toBe(true)
			expect(session.bookmarkQuery.value).toBe("")
			expect(session.bookmarkTarget.value).toEqual({ path: "/home/notes.txt", isDir: false })
			expect(session.bookmarkItems.value[0].add).toBe(true)
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.bookmarks.entries.value["notes.txt"].path).toBe("/home/notes.txt")
			expect(session.bookmarks.entries.value["notes.txt"].isDir).toBe(false)
			expect(session.bookmarkOpen.value).toBe(false)

			// Reopening lists the stored bookmark; Enter selects and previews it.
			setup.mockInput.pressKey("b")
			await settle(setup)
			expect(session.bookmarkItems.value.map((row) => row.name)).toContain("notes.txt")
			expect(session.bookmarkItems.value.some((row) => row.add)).toBe(false)
			setup.mockInput.pressKey("\r")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.bookmarkOpen.value).toBe(false)
			expect(session.panes.left.currentEntry().path).toBe("/home/notes.txt")

			// With an empty filter, Backspace removes the selected bookmark.
			setup.mockInput.pressKey("b")
			await settle(setup)
			setup.mockInput.pressKey("\u007f")
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.bookmarks.entries.value).toEqual({})
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`!` lands on the shell operation with its CMD field focused", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("!")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("run")
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelTextual.value).toBe(true)
			expect(setup.captureCharFrame()).toContain("Command · run")

			// The raw field takes the rest of the line verbatim, so fileset
			// tokens still reach `expandArg` when the operation runs.
			await setup.mockInput.typeText("stat $A")
			await settle(setup)
			expect(session.panelValue.value).toBe("stat $A")
			expect(argvFor(session.panelDraft.value)).toEqual(["stat $A"])
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`:` opens the command panel", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey(":")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("Command ·")
			expect(frame).toContain("Command")
			expect(frame).toContain("[Run]")
			expect(frame).not.toContain("copy FROM TO")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("stat shows a details card in the preview", async () => {
		const { setup, session } = await makeSetup()
		try {
			await session.dispatch("list.cursor", { paneId: "left", index: 0 })
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			await import("../../src/js/tcmd/core/script.js").then(({ runLine }) =>
				runLine(session, "stat tester"),
			)
			await new Promise((resolve) => setTimeout(resolve, 0))
			await setup.renderOnce()
			expect(session.preview.value.kind).toBe("directory")
			expect(setup.captureCharFrame()).toContain("directory")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shift-tab switches back to the previous pane", async () => {
		const { setup, session } = await makeSetup(100, 20, { viewMode: "commander" })
		try {
			expect(session.active.value).toBe("left")
			// Shift-Tab arrives as CSI Z on the wire.
			setup.mockInput.pressKey("\x1B[Z")
			await settle(setup)
			expect(session.active.value).toBe("right")
			setup.mockInput.pressKey("\x1B[Z")
			await settle(setup)
			expect(session.active.value).toBe("left")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clicking a pane row activates that pane", async () => {
		const { setup, session } = await makeSetup(90, 18, { viewMode: "commander" })
		try {
			expect(session.active.value).toBe("left")
			// First entry row of the right pane (frame border, merged header).
			await setup.mockMouse.click(60, 2)
			await settle(setup)
			expect(session.active.value).toBe("right")
			expect(session.panes.right.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clicking the body of a pane activates it", async () => {
		const { setup, session } = await makeSetup(90, 18, { viewMode: "commander" })
		try {
			expect(session.active.value).toBe("left")
			// Blank area inside the right pane (past its last entry).
			await setup.mockMouse.click(55, 12)
			await settle(setup)
			expect(session.active.value).toBe("right")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clicking the identity bar's mode word toggles the view", async () => {
		const { setup, session } = await makeSetup(120, 30, { viewMode: "commander" })
		try {
			expect(session.viewMode.value).toBe("commander")
			// The mode word rides the right-hand end of the identity bar (row 0).
			const row0 = setup.captureCharFrame().split("\n")[0]
			await setup.mockMouse.click(row0.indexOf("commander") + 1, 0)
			await settle(setup)
			expect(session.viewMode.value).toBe("explorer")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("v toggles the preview column", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("v")
			await settle(setup)
			expect(session.showPreview.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("enter on a file opens the fullscreen viewer it cannot edit", async () => {
		// The helper's session uses the null host (`canEdit: false`), so Enter
		// on a text file opens the viewer overlay, even on a wide terminal.
		const { setup, session } = await makeSetup()
		try {
			session.panes.left.cursor.set(1)
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.viewerOpen.value).toBe(true)
			// The bar follows the viewer: preview actions, not workspace keys.
			const viewerBar = setup.captureCharFrame()
			expect(viewerBar).toContain("[Scroll ↑/↓]")
			expect(viewerBar).toContain("[Prev ←]")
			expect(viewerBar).toContain("[Next →]")
			expect(viewerBar).not.toContain("[Commands :]")
			// ⇧V is swallowed by the overlay: it neither closes nor maximizes.
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.viewerOpen.value).toBe(true)
			expect(session.previewFull.value).toBe(false)
			// Esc closes the overlay and returns to the workspace.
			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await setup.renderOnce()
			expect(session.viewerOpen.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("a directory in the fullscreen viewer keeps its listing keys", async () => {
		// Narrow terminal: `v` opens the viewer instead of the inline inspector.
		const { setup, session } = await makeSetup(80, 20)
		try {
			expect(session.previewDirectory.value).toBe(true)
			setup.mockInput.pressKey("v")
			await settle(setup)
			expect(session.viewerOpen.value).toBe(true)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("[Row ↑/↓]")
			expect(frame).toContain("[Open →/⏎]")
			expect(frame).toContain("[Mark Spc]")
			expect(frame).toContain("[Close Esc]")
			// The listing owns the arrows: the inspector is the only listing on
			// screen, so the cursor command resolves to it without moving the
			// workspace focus.
			setup.mockInput.pressArrow("down")
			await settle(setup)
			expect(session.focusedId.value).toBe("preview")
			expect(session.active.value).toBe("left")
			// The inspector's listing took the key, not the pane behind it.
			expect(session.panes.left.cursor.value).toBe(0)
			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await setup.renderOnce()
			expect(session.viewerOpen.value).toBe(false)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shift-s captures the screen through the host hook", async () => {
		const { setup, session } = await makeSetup()
		const calls = []
		try {
			// The real TUI installs `writeScreenshot` here; the spy keeps the
			// test off the real filesystem while exercising the whole chain:
			// keymap -> app.screenshot -> screenshot operation -> host hook.
			session.os = {
				...session.os,
				screenshot: async (paths) => {
					calls.push(paths)
					return paths
				},
			}
			setup.mockInput.pressKey("S")
			await settle(setup)
			await session.screenshotPending
			await settle(setup)
			expect(calls).toEqual([{ svgPath: "/home/screenshot.svg", ansPath: "/home/screenshot.ans" }])
			expect(session.notice.value).toEqual({
				kind: "tip",
				text: "screenshot → screenshot.svg + screenshot.ans",
			})
		} finally {
			setup.renderer.destroy()
		}
	})

	test("shift-v maximizes the inspector over the pane row", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Both panes are on screen first (`etc` is the destination's).
			expect(setup.captureCharFrame()).toContain("etc")
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.previewFull.value).toBe(true)
			const frame = setup.captureCharFrame()
			// The identity and command bars stay; the pane row is the preview,
			// and the bar describes the previewed directory's listing.
			expect(frame.split("\n")[0]).toContain("TinyCmd")
			expect(frame).toContain("[Row ↑/↓]")
			expect(frame).toContain("[Open →/⏎]")
			expect(frame).toContain("[Restore ⇧V]")
			expect(frame).not.toContain("[Commands :]")
			expect(frame).toContain("notes.txt")
			// The destination pane's listing is covered by the preview.
			expect(frame).not.toContain("etc")
			// Shift-V again restores the panes untouched.
			setup.mockInput.pressKey("V")
			await settle(setup)
			expect(session.previewFull.value).toBe(false)
			expect(setup.captureCharFrame()).toContain("etc")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("slash filters the pane, enter keeps it and escape clears", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("/")
			await settle(setup)
			expect(session.filtering.value).toBe("left")

			await setup.mockInput.typeText("tiny")
			await settle(setup)
			expect(session.panes.left.filter.value).toBe("tiny")
			expect(session.panes.left.entries.value.map((e) => e.name)).toEqual(["tiny.txt"])
			expect(session.panes.left.cursor.value).toBe(0)
			const filtered = setup.captureCharFrame()
			expect(filtered).toContain("/ tiny")
			expect(filtered).toContain("tiny.txt")
			expect(filtered).not.toContain("notes.txt")

			setup.mockInput.pressEnter()
			await settle(setup)
			expect(session.filtering.value).toBeNull()
			expect(session.panes.left.filter.value).toBe("tiny")

			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await setup.renderOnce()
			expect(session.panes.left.filter.value).toBe("")
			expect(session.panes.left.entries.value.length).toBe(3)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("filter shows a no-match alert when nothing matches", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("/")
			await settle(setup)
			await setup.mockInput.typeText("zzz")
			await settle(setup)
			expect(session.panes.left.entries.value.length).toBe(0)
			expect(setup.captureCharFrame()).toContain("no match")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("typing filters re-anchor the cursor through setFilter", async () => {
		const { setup, session } = await makeSetup()
		try {
			// Park the cursor on the last entry, then filter to the first one.
			session.panes.left.cursor.set(2)
			setup.mockInput.pressKey("/")
			await settle(setup)
			await setup.mockInput.typeText("tester")
			await settle(setup)
			expect(session.panes.left.filter.value).toBe("tester")
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`u` opens the history overlay", async () => {
		const { setup, session } = await makeSetup()
		try {
			session.journal.record({ label: "mkdir demo", undo: async () => {}, redo: async () => {} })
			setup.mockInput.pressKey("u")
			await settle(setup)
			expect(session.overlay.value).toBe("history")
			const frame = setup.captureCharFrame()
			expect(frame).toContain("history")
			expect(frame).toContain("mkdir demo")
			expect(frame).toContain("[Jump ⏎]")
			// Esc closes it (a lone Esc is parsed on a later tick).
			setup.mockInput.pressEscape()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await settle(setup)
			expect(session.overlay.value).toBeNull()
		} finally {
			setup.renderer.destroy()
		}
	})

	test("`n` opens the command panel on mkdir", async () => {
		const { setup, session } = await makeSetup()
		try {
			setup.mockInput.pressKey("n")
			await settle(setup)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("mkdir")
			expect(setup.captureCharFrame()).toContain(" Command · mkdir ")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the trash overlay lists trashed entries and restores", async () => {
		const { setup, session } = await makeSetup()
		try {
			await session.fs.trash(["/home/tester/notes.txt"])
			await session.dispatch("trash.open")
			await settle(setup)
			expect(session.overlay.value).toBe("trash")
			expect(session.overlayItems.value.length).toBe(1)
			expect(setup.captureCharFrame()).toContain("trash")
			// Enter restores the entry under the cursor.
			setup.mockInput.pressEnter()
			await new Promise((resolve) => setTimeout(resolve, 20))
			await settle(setup)
			expect(await session.fs.stat("/home/tester/notes.txt")).not.toBeNull()
			expect(session.overlayItems.value.length).toBe(0)
		} finally {
			setup.renderer.destroy()
		}
	})
})
