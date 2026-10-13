// Web bootstrap integration: the OPFS adapter plus the demo seeding driving
// the real shared App on happy-dom — the browser path minus `navigator.storage`
// and the bundler.

import { beforeAll, describe, expect, test } from "bun:test"
import { createNullOs, createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { createOpfsFs } from "../../src/js/tcmd/web/opfs.js"
import { seedOpfs } from "../../src/js/tcmd/web/seed.js"
import { createMockOpfs } from "../helpers/mock-opfs.js"

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

async function boot(options = {}) {
	const { root } = createMockOpfs()
	const fs = createOpfsFs({ root })
	const seeded = await seedOpfs(fs)
	const left = createPane({ fs, path: fs.home() })
	const right = createPane({ fs, path: "/" })
	// The session opens in explorer; commander-specific tests pass the mode.
	const session = createSession({ fs, os: createNullOs(), left, right, viewMode: options.viewMode })
	await load(session)
	const host = document.createElement("div")
	document.body.appendChild(host)
	const instance = createWebApp(session).new().mount(host)
	return { fs, host, instance, seeded, session }
}

describe("opfs web bootstrap", () => {
	test("seeds the demo tree once, behind a marker", async () => {
		const { root } = createMockOpfs()
		const fs = createOpfsFs({ root })
		expect(await seedOpfs(fs)).toBe(true)
		expect((await fs.stat("/.seeded"))?.isDir).toBe(false)
		expect(await fs.stat("/home/tester/notes.txt")).not.toBeNull()
		// User edits survive a later boot: the marker suppresses re-seeding.
		await fs.writeText("/home/tester/notes.txt", "edited")
		expect(await seedOpfs(fs)).toBe(false)
		expect(await fs.readTextHead("/home/tester/notes.txt")).toBe("edited")
	})

	test("mounts the shared app over seeded OPFS storage", async () => {
		const { host, instance } = await boot({ viewMode: "commander" })
		try {
			expect(host.textContent).toContain("notes.txt")
			expect(host.textContent).toContain("README.md")
			expect(host.querySelectorAll(".pane-right .file-row").length).toBeGreaterThan(0)
			expect(host.querySelector(".crumb.is-root")).not.toBeNull()
		} finally {
			instance?.unmount?.()
		}
	})

	test("pane navigation reads directories through the adapter", async () => {
		const { host, instance, session } = await boot()
		try {
			await session.panes.left.navigate("/projects")
			await new Promise((resolve) => setTimeout(resolve, 0))
			const names = [...host.querySelectorAll(".pane-left .name")].map((node) => node.textContent)
			expect(names).toContain("tcmd/")
		} finally {
			instance?.unmount?.()
		}
	})

	test("the web command panel copies through the OPFS backend", async () => {
		const { fs, host, instance, session } = await boot({ viewMode: "commander" })
		try {
			const notes = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(notes)
			session.dispatch("panel.open")
			session.panelQuery.set("copy")
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(host.querySelector(".panel-runs pre").textContent).toBe("copy /home/tester/notes.txt /")
			await session.dispatch("panel.run")
			expect(session.panelOpen.value).toBe(false)
			expect(await fs.readTextHead("/notes.txt")).toBe(await fs.readTextHead("/home/tester/notes.txt"))
		} finally {
			instance.unmount()
		}
	})
})
