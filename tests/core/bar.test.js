// Command-bar composition: the contextual matrix itself, independent of a
// session. The session-level wiring (which cell feeds which field) is covered
// in `core/session.test.js`.

import { describe, expect, test } from "bun:test"
import { getCommandBarItems } from "../../src/js/tcmd/core/bar.js"
import { getCommand } from "../../src/js/tcmd/core/commands.js"

// One representative context per branch of the precedence chain.
const CONTEXTS = {
	"workspace (commander)": { active: "right" },
	"workspace (explorer parent)": { active: "parent", viewMode: "explorer" },
	"workspace (inspector over a directory)": { active: "preview", previewVisible: true, previewDirectory: true },
	"workspace (inspector over a file)": { active: "preview", previewVisible: true, previewDirectory: false },
	"fullscreen viewer (file)": { viewerOpen: true, previewDirectory: false },
	"fullscreen viewer (directory)": { viewerOpen: true, previewDirectory: true },
	"maximized preview (file)": { previewFull: true, previewDirectory: false },
	"maximized preview (directory)": { previewFull: true, previewDirectory: true },
	"panel": { panelOpen: true },
	"panel picker": { panelOpen: true, pickerOpen: true },
	"armed panel": { panelOpen: true, panelArmed: true },
	"bookmarks": { bookmarkOpen: true },
	"history overlay": { overlay: "history" },
	"trash overlay": { overlay: "trash" },
	"pane filter": { filtering: "left" },
	"confirm": { confirm: { text: "erase?" } },
}

describe("command bar composition", () => {
	for (const [label, context] of Object.entries(CONTEXTS)) {
		test(`${label}: every clickable row names a registered command`, () => {
			for (const row of getCommandBarItems(context)) {
				if (row.id === null) continue
				expect(getCommand(row.id)).not.toBeNull()
			}
		})
	}

	test("every workspace column keeps the panel entry point", () => {
		const workspace = [
			{ active: "left" },
			{ active: "right" },
			{ active: "parent", viewMode: "explorer" },
			{ active: "preview", previewVisible: true, previewDirectory: true },
			{ active: "preview", previewVisible: true, previewDirectory: false },
		]
		for (const context of workspace) {
			const first = getCommandBarItems(context)[0]
			expect(first.id).toBe("panel.open")
			expect(first.primary).toBe(false)
		}
	})

	test("a listing column leads with Open and keeps its key hints", () => {
		const directory = getCommandBarItems({ active: "preview", previewVisible: true, previewDirectory: true })
		expect(directory.map((row) => row.title)).toEqual([
			"Commands",
			"Open",
			"Parent",
			"Mark",
			"Switch",
			"Hide",
			"Maximize",
			"Help",
			"Bookmarks",
			"Toggle Mode",
		])
		expect(directory.find((row) => row.id === "list.mark")?.keys).toBe("Spc")
		expect(directory.find((row) => row.primary)?.id).toBe("pane.enter")
	})

	test("full previews label file Open/Edit with the keymap chord, in both modes", () => {
		for (const context of [CONTEXTS["fullscreen viewer (file)"], CONTEXTS["maximized preview (file)"]]) {
			const rows = getCommandBarItems(context)
			expect(rows.find((row) => row.id === "file.open")?.keys).toBe("⇧O")
			expect(rows.find((row) => row.id === "file.edit")?.keys).toBe("⇧E")
		}
	})

	test("a full directory preview offers the listing keys, a file card does not", () => {
		const directory = getCommandBarItems(CONTEXTS["fullscreen viewer (directory)"])
		expect(directory.map((row) => row.title)).toEqual(["Row", "Open", "Parent", "Mark", "Close"])
		const file = getCommandBarItems(CONTEXTS["fullscreen viewer (file)"])
		expect(file.map((row) => row.title)).toEqual(["Scroll", "Prev", "Next", "Open", "Edit", "Close"])
	})
})

// EOF
