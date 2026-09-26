import { beforeAll, describe, expect, test } from "bun:test"

// The web presentation needs a DOM before select/ui can be imported, so the
// catalogue is imported dynamically after installing happy-dom globals.

let Summary
let FileList

beforeAll(async () => {
	const { Window } = await import("happy-dom")
	const window = new Window()
	globalThis.window = window
	globalThis.document = window.document
	globalThis.DOMParser = window.DOMParser
	globalThis.Node = window.Node
	globalThis.HTMLElement = window.HTMLElement
	globalThis.customElements = window.customElements
	globalThis.location = window.location
	globalThis.navigator = window.navigator
	const catalogue = await import("../../src/js/tcmd/web/catalogue.js")
	Summary = catalogue.Summary
	FileList = catalogue.FileList
})

describe("web components", () => {
	test("Summary renders the shared summary logic", () => {
		const host = document.createElement("div")
		document.body.appendChild(host)
		Summary.new()
			.set({
				disk: { free: 1024, total: 2048 },
				entries: [
					{ isDir: true, name: "a", size: 0 },
					{ isDir: false, name: "b.txt", size: 2048 },
				],
			})
			.mount(host)
		expect(host.textContent).toContain("1 dirs, 1 files, 2.0K")
		expect(host.textContent).toContain("1.0K free of 2.0K")
	})

	test("FileList maps rows through the shared FileRow behaviors", () => {
		const host = document.createElement("div")
		document.body.appendChild(host)
		FileList.new()
			.set({
				cursor: 1,
				entries: [
					{ isDir: false, name: "a.txt", path: "/a.txt", size: 10 },
					{ isDir: true, name: "sub", path: "/sub", size: 0 },
				],
				marked: new Set(["/a.txt"]),
				paneId: "left",
			})
			.mount(host)
		expect(host.textContent).toContain("a.txt")
		expect(host.textContent).toContain("sub/")
		expect(host.textContent).toContain("* ")
	})
})
