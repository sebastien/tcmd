// Web App integration: mounts the shared App controller on select.js against a
// real session, exercising `read()` over reactive cells, `Component.map` with
// resolved collections, and the `.sub(...)` event path (row click -> dispatch).
//
// `web/catalogue.test.js` covers leaf components with plain data; this test
// drives the reactive session cells the shared behaviors actually receive.

import { beforeAll, describe, expect, test } from "bun:test"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createMockFs } from "../helpers/mock-fs.js"

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

let createWebApp

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
	globalThis.Event = window.Event
	globalThis.MouseEvent = window.MouseEvent
	;({ createWebApp } = await import("../../src/js/tcmd/web/app.js"))
})

async function mountApp() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	const session = createSession({ fs, left, right })
	await load(session)
	const host = document.createElement("div")
	document.body.appendChild(host)
	const instance = createWebApp(session).new().mount(host)
	return { host, instance, session }
}

describe("web app", () => {
	test("mounts the shared App over a reactive session", async () => {
		const { host, instance } = await mountApp()
		try {
			// Toolbar/FileList/Breadcrumbs all come from reactive session cells.
			expect(host.textContent).toContain("Switch[Tab]")
			expect(host.textContent).toContain("notes.txt")
			expect(host.textContent).toContain("tester/")
			expect(host.querySelectorAll(".file-row.is-current").length).toBeGreaterThan(0)
			expect(host.querySelectorAll(".name.is-dir").length).toBeGreaterThan(0)
			expect(host.querySelector(".crumb.is-root")).not.toBeNull()
			// App.html wrappers are neutral containers: no duplicated child roots.
			expect(host.querySelector(".file-list .file-list")).toBeNull()
			expect(host.querySelector("ul > ul")).toBeNull()
			expect(host.querySelector(".toolbar .toolbar")).toBeNull()
		} finally {
			instance?.unmount?.()
		}
	})

	test("a row click bubbles through .sub to a dispatch", async () => {
		const { host, instance, session } = await mountApp()
		try {
			const paneLeft = host.querySelector(".pane-left")
			const rows = paneLeft.querySelectorAll(".file-row")
			// Row 1 is `notes.txt` (row 0 is `tester/`).
			rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
			await Promise.resolve()
			expect(session.panes.left.cursor.value).toBe(1)
		} finally {
			instance?.unmount?.()
		}
	})
})
