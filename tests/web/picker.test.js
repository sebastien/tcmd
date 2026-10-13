// Web rendering of the command panel's file picker: the argument column turns
// into a browsable listing (its own filter and directory rows), and choosing a
// row writes the path back into the argument.

import { beforeAll, describe, expect, test } from "bun:test"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [
		{ name: "home", isDir: true },
		{ name: "etc", isDir: true },
	],
	"/home": [
		{ name: "docs", isDir: true },
		{ name: "notes.txt", text: "hello", size: 5 },
		{ name: "tmp", isDir: true },
	],
	"/home/docs": [{ name: "readme.md", text: "# hi", size: 4 }],
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

async function mountApp() {
	const fs = createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/home/docs" })
	const session = createSession({ fs, left, right })
	await load(session)
	const host = document.createElement("div")
	document.body.appendChild(host)
	const instance = createWebApp(session, {}).new().mount(host)
	await settle()
	return { host, instance, session, fs }
}

// Opens the command panel on `name` and browses its `argName` argument.
async function browse(session, name, argName) {
	session.dispatch("panel.open")
	const index = session.panelFiltered.value.findIndex((entry) => entry.name === name)
	session.dispatch("panel.setOp", { index })
	await settle()
	const rowIndex = session.panelRows.value.findIndex((row) => row.type === "arg" && row.name === argName)
	session.dispatch("panel.focusArg")
	session.dispatch("panel.setRow", { index: rowIndex })
	await session.dispatch("panel.browse")
	await settle()
}

describe("web picker", () => {
	test("browsing a dest turns the argument column into a directory listing", async () => {
		const { host, instance, session } = await mountApp()
		try {
			await browse(session, "copy", "TO")
			const picker = host.querySelector(".panel-picker")
			expect(picker).not.toBeNull()
			expect(host.querySelector(".panel-picker-path").textContent).toBe("/home")
			// A destination picker lists directories only: the file is excluded.
			const names = [...host.querySelectorAll(".panel-args .panel-name")].map((el) => el.textContent)
			expect(names).toEqual(["docs/", "tmp/"])
			// Its own input owns the keyboard.
			expect(document.activeElement).toBe(host.querySelector(".panel-picker-query"))
		} finally {
			instance?.unmount?.()
		}
	})

	test("typing narrows the picker and Enter chooses the highlighted row", async () => {
		const { host, instance, session } = await mountApp()
		try {
			await browse(session, "copy", "TO")
			const query = host.querySelector(".panel-picker-query")
			query.value = "tmp"
			query.dispatchEvent(new query.ownerDocument.defaultView.Event("input", { bubbles: true }))
			await settle()
			expect([...host.querySelectorAll(".panel-args .panel-name")].map((el) => el.textContent)).toEqual(["tmp/"])
			await session.dispatch("panel.pick.enter")
			await settle()
			expect(host.querySelector(".panel-picker")).toBeNull()
			const dst = session.panelDraft.value.find((binding) => binding.name === "TO")
			expect(dst.value).toBe("/home/tmp")
		} finally {
			instance?.unmount?.()
		}
	})

	test("a rename previews its mapping in the runs line", async () => {
		const { host, instance, session } = await mountApp()
		try {
			// Put the cursor on `notes.txt` then open the rename operation.
			const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(index)
			session.dispatch("panel.open")
			const opIndex = session.panelFiltered.value.findIndex((entry) => entry.name === "rename")
			session.dispatch("panel.setOp", { index: opIndex })
			await settle()
			// FIND is prefilled with the basename; set REPLACE and check the preview.
			session.panelDraft.set(
				session.panelDraft.value.map((b) => (b.name === "REPLACE" ? { ...b, value: "memo.txt" } : b)),
			)
			await settle()
			expect(host.querySelector(".panel-runs pre").textContent).toContain("notes.txt → memo.txt")
		} finally {
			instance?.unmount?.()
		}
	})
})
