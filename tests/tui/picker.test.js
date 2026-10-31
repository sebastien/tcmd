// TUI rendering of the command panel's file picker: the argument column shows
// the browsed directory, its own filter line and the directory rows.

import { describe, expect, test } from "bun:test"
import { makeSetup, settle } from "../helpers/tui-setup.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "docs", isDir: true },
		{ name: "notes.txt", text: "hello", size: 5 },
		{ name: "tmp", isDir: true },
	],
	"/home/docs": [{ name: "readme.md", text: "# hi", size: 4 }],
}

async function openPicker(setup, session) {
	session.dispatch("panel.open")
	const index = session.panelFiltered.value.findIndex((entry) => entry.name === "copy")
	session.dispatch("panel.setOp", { index })
	const rowIndex = session.panelRows.value.findIndex((row) => row.type === "arg" && row.name === "TO")
	session.dispatch("panel.focusArg")
	session.dispatch("panel.setRow", { index: rowIndex })
	await session.dispatch("panel.browse")
	await settle(setup)
}

describe("tui picker", () => {
	test("browsing renders the picker path, filter and directory rows", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			await openPicker(setup, session)
			expect(session.pickerOpen.value).toBe(true)
			const frame = setup.captureCharFrame()
			// The editable path line shows the browsed directory with a trailing
			// slash, and the rows render like a file panel.
			expect(frame).toContain("›")
			expect(frame).toContain("/home/")
			expect(frame).toContain("..")
			expect(frame).toContain("docs/")
			expect(frame).toContain("tmp/")
			expect(frame).toContain("<dir>")
			// The picker hints replace the panel's.
			expect(frame).toContain("Go")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("typing edits the path and narrows the entries", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			await openPicker(setup, session)
			expect(session.pickerPathText.value).toBe("/home/")
			await setup.mockInput.typeText("d")
			await settle(setup)
			expect(session.pickerPathText.value).toBe("/home/d")
			expect(session.pickerRows.value.map((row) => row.name)).toEqual(["..", "docs"])
			const frame = setup.captureCharFrame()
			expect(frame).toContain("/home/d")
			expect(frame).toContain("docs/")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("choosing fills the destination and leaves the picker", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			await openPicker(setup, session)
			session.dispatch("picker.setCursor", {
				index: session.pickerRows.value.findIndex((row) => row.name === "docs"),
			})
			await session.dispatch("picker.enter")
			await settle(setup)
			expect(session.pickerOpen.value).toBe(false)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelDraft.value.find((binding) => binding.name === "TO").value).toBe("/home/docs")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("Enter on the destination opens the picker, and reopens it after a choice", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			session.dispatch("panel.open")
			session.dispatch("panel.setOp", {
				index: session.panelFiltered.value.findIndex((entry) => entry.name === "copy"),
			})
			const to = session.panelRows.value.findIndex((row) => row.type === "arg" && row.name === "TO")
			session.dispatch("panel.focusArg")
			session.dispatch("panel.setRow", { index: to })
			await settle(setup)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.pickerOpen.value).toBe(true)
			// Choosing the current directory returns to TO, where Enter reopens
			// the picker instead of arming the copy.
			await session.dispatch("picker.chooseDir")
			await settle(setup)
			expect(session.pickerOpen.value).toBe(false)
			expect(session.panelArmed.value).toBe(false)
			setup.mockInput.pressKey("\r")
			await settle(setup)
			expect(session.pickerOpen.value).toBe(true)
		} finally {
			setup.renderer.destroy()
		}
	})

	test("replace previews its mapping above the pinned Run action", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(index)
			session.dispatch("panel.open")
			const opIndex = session.panelFiltered.value.findIndex((entry) => entry.name === "replace")
			session.dispatch("panel.setOp", { index: opIndex })
			session.panelDraft.set(
				session.panelDraft.value.map((b) => (b.name === "REPLACE" ? { ...b, value: "memo.txt" } : b)),
			)
			await settle(setup)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("REPLACE")
			expect(frame).toContain("memo.txt")
			expect(frame).toContain("[Run]")
			expect(frame).toContain("notes.txt → memo.txt")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("rename prefills TO from FROM and previews the live diff", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 24)
		try {
			const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(index)
			session.dispatch("panel.open")
			const opIndex = session.panelFiltered.value.findIndex((entry) => entry.name === "rename")
			session.dispatch("panel.setOp", { index: opIndex })
			await settle(setup)
			// The prefill starts unchanged, so the third line says so.
			expect(session.panelDraft.value.find((b) => b.name === "TO").value).toBe("notes.txt")
			expect(setup.captureCharFrame()).toContain("(unchanged)")
			// Focusing TO selects the stem, keeping the extension for typing.
			const rowIndex = session.panelRows.value.findIndex(
				(row) => row.type === "arg" && row.name === "TO",
			)
			session.dispatch("panel.focusArg")
			session.dispatch("panel.setRow", { index: rowIndex })
			await settle(setup)
			const input = setup.renderer.currentFocusedRenderable
			expect(input?.value).toBe("notes.txt")
			expect(input?.getSelection?.()).toEqual({ start: 0, end: 5 })
			session.panelDraft.set(
				session.panelDraft.value.map((b) => (b.name === "TO" ? { ...b, value: "memo.txt" } : b)),
			)
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("notes.txt → memo.txt")
		} finally {
			setup.renderer.destroy()
		}
	})
})
