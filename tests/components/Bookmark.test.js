import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors as bookmarkListBehaviors, bookmarkTitle } from "../../src/js/tcmd/components/BookmarkList.js"
import { createBehaviors as bookmarkRowBehaviors } from "../../src/js/tcmd/components/BookmarkRow.js"
import { DIR_ICON } from "../../src/js/tcmd/components/icons.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("BookmarkList", () => {
	test("titles and visibility follow the mode", () => {
		expect(bookmarkTitle("name")).toBe("bookmark")
		expect(bookmarkTitle("list")).toBe("bookmarks")
		const behaviors = bookmarkListBehaviors(behaviorEnv)
		const naming = { mode: "name", open: true, target: { path: "/home", isDir: true }, items: [] }
		expect(behaviors.inputVisible(null, naming)).toBe(true)
		expect(behaviors.listVisible(null, naming)).toBe(false)
		expect(behaviors.target(null, naming)).toBe("/home/")
		const file = { mode: "name", open: true, target: { path: "/notes.txt", isDir: false }, items: [] }
		expect(behaviors.target(null, file)).toBe("/notes.txt")
		const listing = { mode: "list", open: true, items: [] }
		expect(behaviors.listVisible(null, listing)).toBe(true)
		expect(behaviors.emptyList(null, listing)).toBe(true)
		expect(behaviors.footer(null, listing)).toContain("jump")
		expect(behaviors.footer(null, listing)).toContain("remove")
	})
})

describe("BookmarkRow", () => {
	test("markers, names and paths react to the selected cell", () => {
		const behaviors = bookmarkRowBehaviors(behaviorEnv)
		const selected = cell(0)
		const row = { item: { name: "home", path: "/home", isDir: true }, index: 0, selected }
		expect(behaviors.rowMarker(null, row)).toBe(">")
		// A directory bookmark reads as `name/`.
		expect(behaviors.rowName(null, row)).toBe("home/")
		expect(behaviors.rowPath(null, row)).toBe("/home")
		expect(behaviors.rowBg(null, row)).toBe("selected")
		const file = { item: { name: "notes", path: "/notes.txt", isDir: false }, index: 0, selected }
		expect(behaviors.rowName(null, file)).toBe("notes")
		const other = { item: { name: "etc", path: "/etc", isDir: true }, index: 1, selected }
		expect(behaviors.rowMarker(null, other)).toBe(" ")
		expect(behaviors.rowBg(null, other)).toBeUndefined()
	})

	test("rows show the Nerd Font icon in its own dim slot when enabled", () => {
		const behaviors = bookmarkRowBehaviors({ ...behaviorEnv, icons: true })
		const selected = cell(0)
		const row = { item: { name: "home", path: "/home", isDir: true }, index: 0, selected }
		expect(behaviors.hasIcon()).toBe(true)
		expect(behaviors.rowIcon(null, row)).toBe(DIR_ICON)
		expect(behaviors.rowIconFg()).toBe("dim")
		expect(behaviors.rowName(null, row)).toBe("home/")
		// Without the flag (web) the slot collapses.
		expect(bookmarkRowBehaviors(behaviorEnv).hasIcon()).toBe(false)
	})
})
