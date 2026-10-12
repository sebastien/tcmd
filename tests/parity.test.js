// Cross-engine parity: the same session rendered by the TUI (select.tui) and
// the web (select.js) should show the same entries. Both engines consume the
// shared `components/*` logic, so this guards the shared contract end to end.

import { beforeAll, describe, expect, test } from "bun:test"
import { createPane, createSession, load } from "../src/js/tcmd/core/index.js"
import { createMockFs } from "./helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
	"/etc": [{ name: "hosts", text: "127.0.0.1 localhost\n", size: 19 }],
}

let createAppComponent
let createWebApp
let testRender

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
	;({ createWebApp } = await import("../src/js/tcmd/web/app.js"))
	;({ createAppComponent } = await import("../src/js/tcmd/tui/app.js"))
	;({ testRender } = await import("select.tui"))
})

describe("cross-engine parity", () => {
	test("both engines render the same entries for one session", async () => {
		const fs = createMockFs(TREE)
		const left = createPane({ fs, path: "/home" })
		const right = createPane({ fs, path: "/" })
		const session = createSession({ fs, left, right })
		await load(session)

		const host = document.createElement("div")
		document.body.appendChild(host)
		const webInstance = createWebApp(session).new().mount(host)
		const webText = host.textContent

		const setup = await testRender(createAppComponent(session), {
			width: 100,
			height: 20,
		})
		await setup.renderOnce()
		const frame = setup.captureCharFrame()
		setup.renderer.destroy()

		try {
			for (const name of ["tester", "notes.txt", "home", "etc", "TinyCmd"]) {
				expect(webText).toContain(name)
				expect(frame).toContain(name)
			}
			// Both engines advertise the same bracket shorthand for Open.
			expect(webText).toContain("[Open ⏎]")
			expect(frame).toContain("[Open ⏎]")
		} finally {
			webInstance?.unmount?.()
		}
	})

	test("both renderers show the same resolved command and transient selection", async () => {
		const fs = createMockFs(TREE)
		const session = createSession({ fs, left: createPane({ fs, path: "/home" }), right: createPane({ fs, path: "/etc" }) })
		await load(session)
		session.panes.left.cursor.set(1)
		session.panes.left.toggleMark()
		const host = document.createElement("div")
		document.body.appendChild(host)
		const instance = createWebApp(session).new().mount(host)
		const setup = await testRender(createAppComponent(session), { width: 120, height: 30 })
		try {
			session.dispatch("panel.open")
			session.panelQuery.set("copy")
			await new Promise((resolve) => setTimeout(resolve, 30))
			await setup.renderOnce()
			for (const text of ["Command · copy", "notes.txt", "runs", "copy /home/notes.txt /etc"]) {
				expect(host.textContent).toContain(text)
				expect(setup.captureCharFrame()).toContain(text)
			}
			session.dispatch("panel.focusArg")
			session.dispatch("panel.setRow", { index: 1 })
			session.dispatch("panel.toggleItem")
			await new Promise((resolve) => setTimeout(resolve, 30))
			await setup.renderOnce()
			expect(host.querySelector(".panel-runs pre").textContent).toContain("«FROM»")
			expect(setup.captureCharFrame()).toContain("«FROM»")
			expect(session.panes.left.marked.value.has("/home/notes.txt")).toBe(true)
		} finally {
			instance.unmount()
			setup.renderer.destroy()
		}
	})
})
