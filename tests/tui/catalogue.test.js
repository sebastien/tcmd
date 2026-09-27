import { describe, expect, test } from "bun:test"
import { components, keepVisible } from "../../src/js/tcmd/tui/catalogue.js"

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
			width: 60,
			height: 3,
		})
		try {
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
