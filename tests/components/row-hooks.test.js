import { describe, expect, test } from "bun:test"
import { createBehaviors as bookmarks } from "../../src/js/tcmd/components/BookmarkList.js"
import { createBehaviors as breadcrumbs } from "../../src/js/tcmd/components/Breadcrumbs.js"
import { createBehaviors as bar } from "../../src/js/tcmd/components/CommandBar.js"
import { createBehaviors as fileList } from "../../src/js/tcmd/components/FileList.js"
import { createBehaviors as panel } from "../../src/js/tcmd/components/CommandPanel.js"

describe("renderer row hooks", () => {
	test("every row hook receives the component instance, never global self", () => {
		const self = { ref: { list: {} } }
		const data = { items: [], rows: [], entries: [] }
		const rows = (instance, bag) => { expect(instance === self).toBe(true); expect(bag === data).toBe(true); return [] }
		for (const create of [bookmarks, breadcrumbs, bar, fileList]) create({ rows }).rows(self, data)
		const behaviors = panel({ opRows: rows, argRows: rows })
		behaviors.opRows(self, data)
		behaviors.argRows(self, data)
	})
})
