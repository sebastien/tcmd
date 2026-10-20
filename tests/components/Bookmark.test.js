import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { createBehaviors as bookmarkListBehaviors } from "../../src/js/tcmd/components/BookmarkList.js"
import { createBehaviors as bookmarkRowBehaviors } from "../../src/js/tcmd/components/BookmarkRow.js"
import { DIR_ICON } from "../../src/js/tcmd/components/icons.js"
import { behaviorEnv } from "../helpers/behavior-env.js"

describe("BookmarkList", () => {
	test("shows one filter/list panel with removal and open hints", () => {
		const behaviors = bookmarkListBehaviors(behaviorEnv)
		const data = { open: true, query: "", items: [] }
		expect(behaviors.title()).toBe("bookmarks")
		expect(behaviors.focused(null, data)).toBe(true)
		expect(behaviors.emptyList(null, data)).toBe(true)
		expect(behaviors.empty(null, data)).toBe("  no bookmarks")
		expect(behaviors.footer(null, data)).toContain("remove")
		expect(behaviors.footer(null, data)).toContain("open")
		// A filter with no matches reads differently from an empty store.
		expect(behaviors.empty(null, { ...data, query: "zzz" })).toBe("  no matching bookmarks")
		expect(behaviors.emptyList(null, { ...data, items: [{ key: "home" }] })).toBe(false)
	})
})

describe("BookmarkRow", () => {
	test("markers, names and paths react to the selected cell", () => {
		const behaviors = bookmarkRowBehaviors(behaviorEnv)
		const selected = cell(0)
		const row = { item: { key: "home", name: "home", path: "/home", isDir: true }, index: 0, selected }
		expect(behaviors.rowMarker(null, row)).toBe(">")
		// A directory bookmark reads as `name/`.
		expect(behaviors.rowName(null, row)).toBe("home/")
		expect(behaviors.rowPath(null, row)).toBe("/home")
		expect(behaviors.rowBg(null, row)).toBe("selected")
		const file = { item: { key: "notes", name: "notes", path: "/notes.txt", isDir: false }, index: 0, selected }
		expect(behaviors.rowName(null, file)).toBe("notes")
		const other = { item: { key: "etc", name: "etc", path: "/etc", isDir: true }, index: 1, selected }
		expect(behaviors.rowMarker(null, other)).toBe(" ")
		expect(behaviors.rowBg(null, other)).toBeUndefined()
	})

	test("the add row names its action and keeps the target path", () => {
		const behaviors = bookmarkRowBehaviors(behaviorEnv)
		const add = {
			item: { key: "+ add current path", add: true, name: "+ add current path", path: "/home/notes.txt", isDir: false },
			index: 0,
			selected: 0,
		}
		expect(behaviors.rowName(null, add)).toBe("+ add current path")
		expect(behaviors.rowPath(null, add)).toBe("/home/notes.txt")
	})

	test("rows show the Nerd Font icon in its own dim slot when enabled", () => {
		const behaviors = bookmarkRowBehaviors({ ...behaviorEnv, icons: true })
		const selected = cell(0)
		const row = { item: { key: "home", name: "home", path: "/home", isDir: true }, index: 0, selected }
		expect(behaviors.hasIcon()).toBe(true)
		expect(behaviors.rowIcon(null, row)).toBe(DIR_ICON)
		expect(behaviors.rowIconFg()).toBe("dim")
		expect(behaviors.rowName(null, row)).toBe("home/")
		// Without the flag (web) the slot collapses.
		expect(bookmarkRowBehaviors(behaviorEnv).hasIcon()).toBe(false)
	})
})
