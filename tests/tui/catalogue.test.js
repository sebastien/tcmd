import { describe, expect, test } from "bun:test"
import { components, fileListScrollTop, keepVisible, panelDialogHeight, panelOpScrollTop, registerComponents } from "../../src/js/tcmd/tui/catalogue.js"

function hasScrollBar(setup) {
	const colors = [
		[37, 37, 39],
		[154, 158, 163],
	]
	return setup.captureSpans().lines.some((line) =>
		line.spans.some((span) => {
			const bg = span.bg?.buffer
			return bg && colors.some((color) => bg[0] === color[0] && bg[1] === color[1] && bg[2] === color[2])
		}),
	)
}

describe("tui components", () => {
	test("Summary renders the shared summary logic", async () => {
		const { testRender } = await import("select.tui")
		const setup = await testRender(components.Summary, {
			data: {
				disk: { free: 1024, total: 2048 },
				entries: [
					{ isDir: true, name: "a", size: 0 },
					{ isDir: false, name: "b.txt", size: 2048 },
				],
			},
			width: 200,
			height: 3,
		})
		try {
			// The pane/summary width is resolved on the second frame.
			await setup.renderOnce()
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("1 dirs, 1 files, 2.0K")
			expect(frame).toContain("1.0K free of 2.0K")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("FileList maps rows through the shared FileRow behaviors", async () => {
		const { testRender } = await import("select.tui")
		const setup = await testRender(components.FileList, {
			data: {
				cursor: 1,
				entries: [
					{ isDir: false, name: "a.txt", path: "/a.txt", size: 10 },
					{ isDir: true, name: "sub", path: "/sub", size: 0 },
				],
				marked: new Set(["/a.txt"]),
				paneId: "left",
			},
			width: 40,
			height: 5,
		})
		try {
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("a.txt")
			expect(frame).toContain("sub/")
			expect(frame).toContain("* ")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("all TUI scrollboxes show a scrollbar only while content overflows", async () => {
		registerComponents()
		const { testRender } = await import("select.tui")
		const entries = Array.from({ length: 20 }, (_, index) => ({
			isDir: false,
			name: `file-${index}.txt`,
			path: `/file-${index}.txt`,
			size: index,
		}))
		const setup = await testRender(components.FileList, {
			data: { cursor: 0, entries, marked: new Set(), paneId: "left" },
			height: 5,
			width: 40,
		})
		try {
			await setup.renderOnce()
			await setup.renderOnce()
			expect(hasScrollBar(setup)).toBe(true)
		} finally {
			setup.renderer.destroy()
		}

		const short = await testRender(components.FileList, {
			data: { cursor: 0, entries: entries.slice(0, 1), marked: new Set(), paneId: "left" },
			height: 5,
			width: 40,
		})
		try {
			await short.renderOnce()
			await short.renderOnce()
			expect(hasScrollBar(short)).toBe(false)
		} finally {
			short.renderer.destroy()
		}
	})
})

describe("preview host tags", () => {
	test("registers the code and image renderables", async () => {
		registerComponents()
		const { getTags } = await import("select.tui")
		const tags = getTags()
		expect(typeof tags.image?.Class).toBe("function")
		expect(typeof tags.code?.Class).toBe("function")
		expect(tags.code.contentProp).toBe("content")
	})

	test("FilePreview highlights a source file through the code renderable", async () => {
		const { testRender } = await import("select.tui")
		const setup = await testRender(components.FilePreview, {
			data: {
				entry: { ext: "ts", isDir: false, name: "a.ts", path: "/a.ts", size: 12 },
				paneId: "preview",
				preview: { ext: "ts", kind: "text", size: 12, text: "const x = 1\n", title: "a.ts" },
				show: true,
			},
			height: 8,
			width: 40,
		})
		try {
			await setup.renderOnce()
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("a.ts  <TS>")
			expect(frame).toContain("const x = 1")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("FilePreview keeps the card for a format it cannot draw", async () => {
		const { testRender } = await import("select.tui")
		const setup = await testRender(components.FilePreview, {
			data: {
				entry: { ext: "svg", isDir: false, name: "a.svg", path: "/a.svg", size: 12 },
				paneId: "preview",
				preview: { ext: "svg", kind: "image", size: 12, text: null, title: "a.svg" },
				show: true,
			},
			height: 8,
			width: 40,
		})
		try {
			await setup.renderOnce()
			await setup.renderOnce()
			// SVG has no decoder in the image renderable, so the metadata card
			// stays in the body.
			expect(setup.captureCharFrame()).toContain("image: a.svg")
		} finally {
			setup.renderer.destroy()
		}
	})
})

describe("keepVisible", () => {
	// A viewport of 10 rows over 100 rows of content: the cursor rides the
	// bottom quarter going down (scroll at pos > 75%) and the top quarter going
	// up (scroll at pos < 25%).
	const box = (scrollTop, extra = {}) => ({ height: 10, scrollTop, ...extra })

	test("does not scroll while the cursor sits between the margins", () => {
		expect(keepVisible(box(2), 5, 100)).toBe(2)
	})

	test("scrolls one line down once the cursor passes 75%", () => {
		expect(keepVisible(box(3), 11, 100)).toBe(4)
	})

	test("does not scroll down when no lines remain below", () => {
		expect(keepVisible(box(90), 99, 100)).toBe(90)
	})

	test("scrolls one line up once the cursor drops below 25%", () => {
		expect(keepVisible(box(5), 7, 100)).toBe(4)
	})

	test("does not scroll up at the top of the list", () => {
		expect(keepVisible(box(0), 1, 100)).toBe(0)
	})

	test("clamps a downwards jump so the cursor stays visible", () => {
		// Clamped to the bottom edge, then nudged back one line by the margin.
		expect(keepVisible(box(0), 25, 100)).toBe(17)
		// A jump to the very end cannot scroll past the last page.
		expect(keepVisible(box(0), 99, 100)).toBe(90)
	})

	test("clamps an upwards jump so the cursor stays visible", () => {
		expect(keepVisible(box(20), 3, 100)).toBe(2)
	})

	test("falls back to the scrollbox content height", () => {
		expect(keepVisible(box(3, { scrollHeight: 100 }), 11)).toBe(4)
	})

	test("returns the current scrollTop before layout resolves the height", () => {
		expect(keepVisible({ height: 0, scrollTop: 7 }, 3, 100)).toBe(7)
		expect(keepVisible(undefined, 3, 100)).toBe(0)
	})
})

describe("fileListScrollTop", () => {
	const entries = Array.from({ length: 100 }, (_, i) => ({ path: `/f${i}` }))
	const box = (extra = {}) => ({ height: 10, scrollTop: 0, ...extra })

	test("scrolls to the cursor's index inside the window", () => {
		// Cursor 40 over a 20-row viewport: the window starts at 32 (40 - 8
		// margin), so the scrollbox holds rows 32..67 and the cursor sits at
		// local index 8. The returned top must keep that row on screen.
		const self = { ref: { list: box() } }
		const data = { entries, cursor: 40, viewport: 20, marked: new Set() }
		const top = fileListScrollTop(self, data)
		expect(top).toBeGreaterThan(0)
		expect(top).toBeLessThanOrEqual(8)
		expect(8).toBeGreaterThanOrEqual(top)
		expect(8).toBeLessThan(top + 10)
	})

	test("without a viewport it scrolls the full listing by absolute index", () => {
		const self = { ref: { list: box() } }
		const data = { entries, cursor: 40, marked: new Set() }
		const top = fileListScrollTop(self, data)
		expect(top).toBeGreaterThan(0)
		// The absolute cursor index stays visible: top <= 40 < top + 10.
		expect(top).toBeLessThanOrEqual(40)
		expect(40).toBeLessThan(top + 10)
	})

	test("degenerates to the current scrollTop before layout", () => {
		const self = { ref: { list: { height: 0, scrollTop: 6 } } }
		const data = { entries, cursor: 40, viewport: 20, marked: new Set() }
		expect(fileListScrollTop(self, data)).toBe(6)
	})
})

describe("panelOpScrollTop", () => {
	test("tracks the selected command through group heading rows", () => {
		const items = [
			{ type: "group", name: "White" },
			{ type: "op", entryIndex: 0 },
			{ type: "op", entryIndex: 1 },
			{ type: "group", name: "Amber" },
			{ type: "op", entryIndex: 2 },
			{ type: "op", entryIndex: 3 },
			{ type: "group", name: "Red" },
			{ type: "op", entryIndex: 4 },
		]
		const self = { ref: { ops: { height: 5, scrollTop: 0 } } }
		const top = panelOpScrollTop(self, { items, opCursor: 4 })
		expect(top).toBe(5)
		expect(top).toBeLessThanOrEqual(7)
		expect(7).toBeLessThan(top + 3)
	})
})

describe("panelDialogHeight", () => {
	test("reserves room for the pinned action on compact terminals", () => {
		expect(panelDialogHeight({ ctx: { height: 18 } })).toBe(15)
		expect(panelDialogHeight({ ctx: { height: 30 } })).toBe(21)
		expect(panelDialogHeight({ ctx: {} })).toBe("72%")
	})
})
