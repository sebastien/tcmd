// Web App integration: mounts the shared App controller on select.js against a
// real session, exercising `unwrap` over reactive cells, `Component.map` with
// reactive collections, and the `.sub(...)` event path (row click -> dispatch).
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
let normalizeKey

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
	;({ createWebApp, normalizeKey } = await import("../../src/js/tcmd/web/app.js"))
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
			// CommandBar/FileList/Breadcrumbs all come from reactive session cells.
			expect(host.textContent).toContain("[Switch ⇥]")
			expect(host.textContent).toContain("notes.txt")
			expect(host.textContent).toContain("tester/")
			expect(host.querySelectorAll(".file-row.is-current").length).toBeGreaterThan(0)
			expect(host.querySelectorAll(".name.is-dir").length).toBeGreaterThan(0)
			expect(host.querySelector(".crumb.is-root")).not.toBeNull()
			// The entry detail sits between the list and the summary.
			const detail = host.querySelector(".pane-left .entry-detail")
			expect(detail).not.toBeNull()
			// Cursor starts on the `tester/` directory.
			expect(detail.textContent).toContain("drwxr-xr-x")
			// The pane header carries the SRC/DST role label.
			expect(host.querySelector(".pane-left .pane-label").textContent).toBe("SRC ")
			expect(host.querySelector(".pane-right .pane-label").textContent).toBe("DST ")
			// App.html wrappers are neutral containers: no duplicated child roots.
			expect(host.querySelector(".file-list .file-list")).toBeNull()
			expect(host.querySelector("ul > ul")).toBeNull()
			expect(host.querySelector(".command-bar .command-bar")).toBeNull()
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

	test("the command panel is disabled and absent from the web bar", async () => {
		const { host, instance, session } = await mountApp()
		try {
			expect(session.panelEnabled.value).toBe(false)
			expect(host.textContent).not.toContain("panel.toggle")
			// `m` is a no-op on the web: no invisible modal opens.
			session.dispatch("panel.toggle")
			expect(session.panelOpen.value).toBe(false)
		} finally {
			instance?.unmount?.()
		}
	})

	test("clicking a row in the other pane activates that pane", async () => {
		const { host, instance, session } = await mountApp()
		try {
			expect(session.active.value).toBe("left")
			const rows = host.querySelectorAll(".pane-right .file-row")
			rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
			await Promise.resolve()
			expect(session.active.value).toBe("right")
		} finally {
			instance?.unmount?.()
		}
	})

	test("key normalization keeps shift for named keys and drops it for punctuation", () => {
		expect(normalizeKey({ key: "Tab", shiftKey: true })).toEqual({
			name: "tab",
			ctrl: false,
			meta: false,
			shift: true,
		})
		expect(normalizeKey({ key: ":", shiftKey: true })).toEqual({
			name: ":",
			ctrl: false,
			meta: false,
			shift: false,
		})
		expect(normalizeKey({ key: "O", shiftKey: true })).toEqual({
			name: "o",
			ctrl: false,
			meta: false,
			shift: true,
		})
	})

	test("session cells drive row updates through the mapped bags", async () => {
		const { host, instance, session } = await mountApp()
		try {
			const rows = () => host.querySelectorAll(".pane-left .file-row")
			expect(rows()[0].classList.contains("is-current")).toBe(true)
			session.panes.left.cursor.set(1)
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(rows()[0].classList.contains("is-current")).toBe(false)
			expect(rows()[1].classList.contains("is-current")).toBe(true)
			// Marks are cells too: the row marker follows the session Set.
			session.panes.left.toggleMark()
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(rows()[1].querySelector(".marker").textContent).toBe("* ")
		} finally {
			instance?.unmount?.()
		}
	})

	test("scripting mode renders the prompt and operation rows", async () => {
		const { host, instance, session } = await mountApp()
		try {
			session.paletteMode.set("script")
			session.paletteOpen.set(true)
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(host.querySelector(".palette-sign").textContent).toBe(":")
			const labels = [...host.querySelectorAll(".palette-item")].map((item) => item.textContent)
			expect(labels.some((label) => label.includes("copy  copy FROM TO"))).toBe(true)
		} finally {
			instance?.unmount?.()
		}
	})

	test("the pane filter bar appears and narrows the list", async () => {
		const { host, instance, session } = await mountApp()
		try {
			expect(host.querySelector(".pane-left .filter-bar")).toBeNull()

			session.panes.left.filter.set("notes")
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(host.querySelector(".pane-left .filter-bar")).not.toBeNull()
			expect(host.querySelector(".pane-left .filter-label").textContent).toBe("notes")
			expect(host.querySelector(".pane-left .filter-alert").textContent).toBe("")
			expect(host.querySelectorAll(".pane-left .file-row").length).toBe(1)

			session.panes.left.filter.set("zzz")
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(host.querySelector(".pane-left .filter-alert").textContent).toBe("no match")
			expect(host.querySelectorAll(".pane-left .file-row").length).toBe(0)

			session.filtering.set("left")
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(host.querySelector(".pane-left .filter-input")).not.toBeNull()
		} finally {
			instance?.unmount?.()
		}
	})
})
