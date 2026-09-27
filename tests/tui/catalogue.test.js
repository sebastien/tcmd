import { describe, expect, test } from "bun:test"
import { components } from "../../src/js/tcmd/tui/catalogue.js"

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
