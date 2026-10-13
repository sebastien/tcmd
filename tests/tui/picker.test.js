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
	const field = session.panelFields.value.find((candidate) => candidate.name === "TO")
	session.dispatch("panel.focusField", { argIndex: field.argIndex })
	await session.dispatch("panel.browse")
	await settle(setup)
}

describe("tui picker", () => {
	test("browsing renders the picker path, filter and directory rows", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			await openPicker(setup, session)
			expect(session.panelPicking.value).toBe(true)
			const frame = setup.captureCharFrame()
			expect(frame).toContain("⌕")
			expect(frame).toContain("/home")
			// A destination picker lists directories only, suffixed with a slash.
			expect(frame).toContain("docs/")
			expect(frame).toContain("tmp/")
			// The picker hints replace the panel's.
			expect(frame).toContain("Choose")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("choosing fills the destination and leaves the picker", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			await openPicker(setup, session)
			await session.dispatch("panel.pick.enter")
			await settle(setup)
			expect(session.panelPicking.value).toBe(false)
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelDraft.value.find((binding) => binding.name === "TO").value).toBe("/home/docs")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("the runs line previews a rename mapping", async () => {
		const { setup, session } = await makeSetup(TREE, 100, 20)
		try {
			const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(index)
			session.dispatch("panel.open")
			const opIndex = session.panelFiltered.value.findIndex((entry) => entry.name === "rename")
			session.dispatch("panel.setOp", { index: opIndex })
			session.panelDraft.set(
				session.panelDraft.value.map((b) => (b.name === "REPLACE" ? { ...b, value: "memo.txt" } : b)),
			)
			await settle(setup)
			expect(setup.captureCharFrame()).toContain("notes.txt → memo.txt")
		} finally {
			setup.renderer.destroy()
		}
	})
})
