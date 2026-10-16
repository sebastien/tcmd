// Web App integration: mounts the shared App controller on select.js against a
// real session, exercising `unwrap` over reactive cells, `Component.map` with
// reactive collections, and the `.sub(...)` event path (row click -> dispatch).
//
// `web/catalogue.test.js` covers leaf components with plain data; this test
// drives the reactive session cells the shared behaviors actually receive.

import { beforeAll, describe, expect, test } from "bun:test"
import { createPane, createSession, load } from "../../src/js/tcmd/core/index.js"
import { VERSION } from "../../src/js/tcmd/components/Frame.js"
import { createMockFs } from "../helpers/mock-fs.js"
import { cell } from "select/state/cells"
import { createHttpFs } from "../../src/js/tcmd/web/http.js"

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

async function mountApp(options = {}) {
	const fs = options.fs ?? createMockFs(TREE)
	const left = createPane({ fs, path: "/home" })
	const right = createPane({ fs, path: "/" })
	// The session opens in explorer; commander-specific tests pass the mode.
	const session = createSession({ fs, left, right, viewMode: options.viewMode })
	await load(session)
	const host = document.createElement("div")
	document.body.appendChild(host)
	const instance = createWebApp(session, options).new().mount(host)
	return { host, instance, session }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

function press(host, key, options = {}) {
	const target = host.ownerDocument.activeElement
	const event = new host.ownerDocument.defaultView.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })
	;(host.contains(target) ? target : host.querySelector(".app")).dispatchEvent(event)
	return event
}

function type(input, value) {
	input.value = value
	input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }))
}

describe("web app", () => {
	test("opens in explorer mode by default", async () => {
		const { host, instance, session } = await mountApp()
		try {
			expect(session.viewMode.value).toBe("explorer")
			expect(host.querySelector(".app-header-status").textContent).toBe(`explorer · ${VERSION}`)
			// The parent and current columns show; the destination does not.
			expect(host.querySelector(".pane-parent")).not.toBeNull()
			expect(host.querySelector(".pane-right")).toBeNull()
		} finally {
			instance?.unmount?.()
		}
	})

	test("the app root carries the view mode class; clicking the mode word toggles", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			// The app root wears the mode class the CSS tints the active pane by.
			expect(host.querySelector(".app").classList.contains("is-commander")).toBe(true)
			host.querySelector(".app-header-mode").dispatchEvent(new MouseEvent("click", { bubbles: true }))
			await settle()
			expect(session.viewMode.value).toBe("explorer")
			expect(host.querySelector(".app").classList.contains("is-explorer")).toBe(true)
		} finally {
			instance?.unmount?.()
		}
	})

	test("mounts the shared App over a reactive session", async () => {
		const { host, instance } = await mountApp({ viewMode: "commander" })
		try {
			// CommandBar/FileList/Breadcrumbs all come from reactive session cells.
			expect(host.textContent).toContain("[Switch ⇥]")
			// The identity bar carries the view mode and version on the right,
			// the mode word wearing the class its gradient hangs off.
			expect(host.querySelector(".app-header-status").textContent).toBe(`commander · ${VERSION}`)
			expect(host.querySelector(".app-header-mode").textContent).toBe("commander")
			expect(host.querySelector(".app-header-mode").className).toBe("app-header-mode mode-commander")
			expect(host.textContent).toContain("notes.txt")
			expect(host.textContent).toContain("tester/")
			expect(host.querySelectorAll(".file-row.is-current").length).toBeGreaterThan(0)
			expect(host.querySelectorAll(".name.is-dir").length).toBeGreaterThan(0)
			expect(host.querySelector(".crumb.is-root")).not.toBeNull()
			// The entry detail sits between the listing and the pane's bottom border.
			const detail = host.querySelector(".pane-left .entry-detail")
			expect(detail).not.toBeNull()
			// Cursor starts on the `tester/` directory.
			expect(detail.textContent).toContain("drwxr-xr-x")
			// The pane header carries no role label: the path leads it.
			expect(host.querySelector(".pane-left .pane-label")).toBeNull()
			expect(host.querySelector(".pane-right .pane-label")).toBeNull()
			// App.html wrappers are neutral containers: no duplicated child roots.
			expect(host.querySelector(".file-list .file-list")).toBeNull()
			expect(host.querySelector("ul > ul")).toBeNull()
			expect(host.querySelector(".command-bar .command-bar")).toBeNull()
		} finally {
			instance?.unmount?.()
		}
	})

	test("the entry detail shows the selected count in the mark span", async () => {
		const { host, instance, session } = await mountApp()
		try {
			const pane = session.panes.left
			pane.toggleMark()
			pane.cursor.set(1)
			pane.toggleMark()
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(host.querySelector(".pane-left .entry-detail-marked").textContent).toBe("2 selected")
			// Back to one mark: the counter drops out.
			pane.toggleMark()
			await new Promise((resolve) => setTimeout(resolve, 20))
			expect(host.querySelector(".pane-left .entry-detail-marked")).toBeNull()
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

	test("`:` opens the visible panel and Escape closes it", async () => {
		const { host, instance, session } = await mountApp()
		try {
			press(host, ":")
			// The panel mounts and focuses its filter a couple of frames in.
			await new Promise((resolve) => setTimeout(resolve, 80))
			expect(session.panelOpen.value).toBe(true)
			expect(host.querySelector(".command-panel")).not.toBeNull()
			expect(document.activeElement === host.querySelector(".panel-query")).toBe(true)
			expect(host.querySelector(".panel-ops").textContent).toContain("copy")
			// The list is the CLI operations only, with no namespace tag.
			const names = [...host.querySelectorAll(".panel-ops .panel-name")].map((row) => row.textContent)
			expect(names).toContain("bookmark")
			expect(names).not.toContain("Open file")
			expect(names.some((name) => name.includes("cli") || name.includes("app"))).toBe(false)
			press(host, "Escape")
			await settle()
			expect(session.panelOpen.value).toBe(false)
			expect(document.activeElement === host.querySelector(".app")).toBe(true)
		} finally {
			instance?.unmount?.()
		}
	})

	test("panel input, clicks and keyboard edit the draft, not the real marks, and Enter runs once", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			session.panes.left.toggleMark()
			session.panes.left.cursor.set(1)
			session.panes.left.toggleMark()
			press(host, ":")
			await settle()
			type(host.querySelector(".panel-query"), "copy")
			await settle()
			expect(session.panelEntry.value.name).toBe("copy")
			expect(host.querySelector(".panel-runs pre").textContent).toBe("copy /home/tester /home/notes.txt /")
			const items = host.querySelectorAll('.panel-args [data-type="item"]')
			items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
			await settle()
			expect(host.querySelector(".panel-runs pre").textContent).toBe("copy /home/notes.txt /")
			expect(session.panes.left.marked.value.size).toBe(2)
			// From an item, Tab returns to operations, then visits FROM and TO.
			press(host, "Tab")
			press(host, "Tab")
			press(host, "Tab")
			await settle()
			expect(document.activeElement === host.querySelector(".panel-value")).toBe(true)
			type(host.querySelector(".panel-value"), "/etc")
			await settle()
			expect(host.querySelector(".panel-runs pre").textContent).toBe("copy /home/notes.txt /etc")
			let copies = 0
			const copy = session.fs.copy
			session.fs.copy = (...args) => { copies++; return copy(...args) }
			press(host, "Enter")
			await settle()
			expect(copies).toBe(1)
			expect(session.panelOpen.value).toBe(false)
			expect(await session.fs.readTextHead("/etc/notes.txt")).toBe("hello\nworld\n")
		} finally {
			instance.unmount()
		}
	})

	test("the panel exposes risk colours and focuses the next missing argument", async () => {
		const { host, instance, session } = await mountApp()
		try {
			press(host, ":")
			await settle()
			expect(host.querySelectorAll('[data-risk="destructive"]').length).toBeGreaterThan(0)
			expect(host.querySelectorAll('[data-risk="caution"]').length).toBeGreaterThan(0)
			type(host.querySelector(".panel-query"), "touch")
			await settle()
			press(host, "Tab")
			press(host, " ")
			await settle()
			expect(host.querySelector(".panel-runs").getAttribute("data-runnable")).toBe("false")
			press(host, "Enter")
			await settle()
			// Enter does not fail: it focuses the missing PATH argument.
			expect(session.panelOpen.value).toBe(true)
			expect(session.notice.value).toBeNull()
			expect(session.panelFocus.value).toBe("args")
			expect(session.panelRowIndex.value).toBe(0)
		} finally {
			instance.unmount()
		}
	})

	test("bookmarks and filters get input focus, and app keys suppress browser defaults", async () => {
		const { host, instance, session } = await mountApp()
		try {
			await settle()
			// The browser's own `^R` shortcut stays swallowed so a reload
			// cannot fire while the app has focus; `^P` belonged to the
			// palette, so the browser gets that key back.
			expect(press(host, "r", { ctrlKey: true }).defaultPrevented).toBe(true)
			expect(press(host, "p", { ctrlKey: true }).defaultPrevented).toBe(false)
			await settle()
			expect(session.panelOpen.value).toBe(false)
			press(host, "b")
			await settle()
			expect(document.activeElement === host.querySelector(".bookmark-query")).toBe(true)
			expect(press(host, " ").defaultPrevented).toBe(false)
			type(host.querySelector(".bookmark-query"), "tester")
			press(host, "Enter")
			await settle()
			expect(session.bookmarks.entries.value.tester).toEqual({ path: "/home/tester", isDir: true })
			press(host, "g")
			await settle()
			expect(document.activeElement === host.querySelector(".bookmark-query")).toBe(true)
			expect(host.querySelector(".bookmark-rows").textContent).toContain("tester/")
			press(host, "Escape")
			await settle()
			expect(press(host, "/").defaultPrevented).toBe(false)
			await settle()
			expect(document.activeElement === host.querySelector(".filter-input")).toBe(true)
			type(host.querySelector(".filter-input"), "notes")
			press(host, "Enter")
			await settle()
			expect(session.panes.left.filter.value).toBe("notes")
			expect(press(host, "PageDown").defaultPrevented).toBe(true)
			press(host, "Escape")
			await settle()
			expect(session.panes.left.filter.value).toBe("")
		} finally {
			instance.unmount()
		}
	})

	test("help is modal and the inspector responds to viewport changes", async () => {
		const size = cell({ width: 120, height: 24 })
		const { host, instance, session } = await mountApp({ size })
		try {
			// The inspector previews the first entry (a directory) as a pane:
			// its breadcrumb header over the directory's own listing.
			const inspector = host.querySelector('[data-slot="inspector"] .preview')
			expect(inspector.textContent).toContain("/home/tester")
			expect(inspector.querySelector(".file-list").textContent).toContain("notes.txt")
			expect(inspector.textContent).not.toContain("directory: tester/")
			press(host, "?")
			await settle()
			const help = host.querySelector(".help").textContent
			expect(help).toContain("COMMANDS")
			expect(help).toContain("Shell command")
			// Two balanced columns of the command bar's own shorthands.
			expect(host.querySelectorAll(".help-column").length).toBe(2)
			expect(host.querySelectorAll(".help-section").length).toBeGreaterThan(0)
			expect(help).toContain("[")
			expect(help).toContain("⏎")
			expect(help).toContain("COMMANDS")
			expect(host.querySelector(".command-bar").textContent).toContain("[Help ?]")
			expect(document.activeElement === host.querySelector(".help")).toBe(true)
			press(host, "ArrowDown")
			expect(session.panes.left.cursor.value).toBe(0)
			press(host, "Escape")
			await settle()
			expect(host.querySelector(".help")).toBeNull()
			size.set({ width: 80, height: 24 })
			await settle()
			expect(host.querySelector('[data-slot="inspector"]')).toBeNull()
			press(host, "v")
			await settle()
			expect(host.querySelector(".viewer .preview")).not.toBeNull()
			press(host, "Escape")
			await settle()
			expect(host.querySelector(".viewer")).toBeNull()
			size.set({ width: 40, height: 10 })
			await settle()
			expect(host.querySelector(".resize-hint").textContent).toContain("Window too small")
			expect(host.querySelector(".panes")).toBeNull()
			size.set({ width: 120, height: 24 })
			await settle()
			expect(host.querySelector(".panes")).not.toBeNull()
		} finally {
			instance.unmount()
		}
	})

	test("t switches to the explorer: a parent column, a wider current, a directory preview", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			expect(host.querySelector(".pane-parent")).toBeNull()
			press(host, "t")
			await settle()
			expect(session.viewMode.value).toBe("explorer")
			expect(host.querySelector(".app-header-status").textContent).toBe(`explorer · ${VERSION}`)
			expect(host.querySelector(".app-header-mode").className).toBe("app-header-mode mode-explorer")
			// First column: the parent of the current directory, a full pane.
			const parent = host.querySelector(".pane-parent")
			expect(parent).not.toBeNull()
			expect(parent.querySelector(".file-list").textContent).toContain("home/")
			// Second column: the current pane, carrying the extra width; the
			// destination pane is not part of this view.
			expect(host.querySelector(".pane-left.is-major")).not.toBeNull()
			expect(host.querySelector(".pane-right")).toBeNull()
			// Third column: the previewed directory reads as a pane, and its
			// rows take focus when clicked.
			const inspector = host.querySelector('[data-slot="inspector"] .preview')
			expect(inspector.querySelector(".file-list").textContent).toContain("notes.txt")
			const row = inspector.querySelector(".file-row")
			row.dispatchEvent(new host.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }))
			await settle()
			// Clicking a row of the previewed directory promotes it to current
			// and selects the clicked entry; focus stays on the preview column.
			expect(session.active.value).toBe("preview")
			expect(session.panes.left.path.value).toBe("/home/tester")
			expect(session.panes.left.currentEntry()?.name).toBe("notes.txt")
		} finally {
			instance.unmount()
		}
	})

	test("shift-v maximizes the inspector over the pane row and restores it", async () => {
		const { host, instance, session } = await mountApp()
		try {
			// Wide viewport: the inline inspector sits beside the panes.
			expect(host.querySelector('[data-slot="inspector"] .preview')).not.toBeNull()
			press(host, "V", { shiftKey: true })
			await settle()
			expect(session.previewFull.value).toBe(true)
			// The columns are gone and the preview fills the row.
			expect(host.querySelector(".pane-left")).toBeNull()
			expect(host.querySelector(".pane-right")).toBeNull()
			expect(host.querySelector(".preview-max .preview")).not.toBeNull()
			// Shift-V again restores the previous layout untouched.
			press(host, "V", { shiftKey: true })
			await settle()
			expect(session.previewFull.value).toBe(false)
			expect(host.querySelector(".preview-max")).toBeNull()
			expect(host.querySelector(".pane-left")).not.toBeNull()
			expect(host.querySelector('[data-slot="inspector"] .preview')).not.toBeNull()
		} finally {
			instance.unmount()
		}
	})

	test("enter on a file opens the fullscreen viewer when it cannot be edited", async () => {
		// The browser host has no editor (`canEdit: false`), so Enter on a text
		// file opens the viewer overlay instead of `$EDITOR`.
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			const index = session.panes.left.entries.value.findIndex((entry) => entry.name === "notes.txt")
			session.panes.left.cursor.set(index)
			await settle()
			press(host, "Enter")
			await settle()
			expect(session.viewerOpen.value).toBe(true)
			const viewer = host.querySelector(".viewer")
			expect(viewer).not.toBeNull()
			expect(viewer.querySelector(".preview").textContent).toContain("notes.txt")
			press(host, "Escape")
			await settle()
			expect(session.viewerOpen.value).toBe(false)
			expect(host.querySelector(".viewer")).toBeNull()
		} finally {
			instance.unmount()
		}
	})

	test("⇧V is swallowed by the viewer overlay, not treated as close", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			session.viewerOpen.set(true)
			await settle()
			expect(host.querySelector(".viewer")).not.toBeNull()
			press(host, "V", { shiftKey: true })
			await settle()
			expect(session.viewerOpen.value).toBe(true)
			expect(host.querySelector(".viewer")).not.toBeNull()
		} finally {
			instance.unmount()
		}
	})

	test("pane focus, loading, empty state and marked count reach the web components", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
		try {
			expect(host.querySelector(".pane-left .is-current").dataset.active).toBe("true")
			expect(host.querySelector(".pane-right .is-current").dataset.active).toBe("false")
			session.panes.left.toggleMark()
			await settle()
			expect(host.querySelector(".pane-left .is-current").dataset.marked).toBe("true")
			expect(host.querySelector(".command-bar").textContent).toContain("1 marked")
			session.panes.left.loading.set(true)
			await settle()
			expect(host.querySelector(".pane-left .file-list").textContent).not.toContain("loading")
			expect(host.querySelector(".pane-left .is-current").dataset.marked).toBe("true")
			session.panes.left.filter.set("no-match")
			await settle()
			expect(host.querySelector(".pane-left .file-list").textContent).toContain("loading")
			session.panes.left.loading.set(false)
			await settle()
			expect(host.querySelector(".pane-left .file-list").textContent).toContain("(empty)")
		} finally {
			instance.unmount()
		}
	})

	test("the same command panel works through the HTTP filesystem adapter", async () => {
		const backend = createMockFs(TREE)
		const calls = []
		const fs = await createHttpFs({
			base: "http://api.test/api",
			fetch: async (url, init) => {
				const route = url.pathname.split("/").pop()
				calls.push(route)
				let payload
				if (route === "info") payload = { root: "/", home: "/home/tester", cwd: "/home" }
				else if (init.method === "POST") {
					const body = JSON.parse(init.body)
					payload = await backend[route](body.from, body.to)
				} else payload = await backend[route](url.searchParams.get("path"))
				return new Response(JSON.stringify(payload ?? { ok: true }), { headers: { "content-type": "application/json" } })
			},
		})
		const { host, instance, session } = await mountApp({ fs, viewMode: "commander" })
		try {
			session.panes.left.cursor.set(1)
			press(host, ":")
			await settle()
			type(host.querySelector(".panel-query"), "copy")
			await settle()
			expect(host.querySelector(".panel-runs pre").textContent).toBe("copy /home/notes.txt /")
			press(host, "Enter")
			await settle()
			expect(session.panelOpen.value).toBe(false)
			expect(calls).toContain("copy")
			expect(await fs.readTextHead("/notes.txt")).toBe("hello\nworld\n")
		} finally {
			instance.unmount()
		}
	})

	test("clicking a row in the other pane activates that pane", async () => {
		const { host, instance, session } = await mountApp({ viewMode: "commander" })
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

	test("`!` lands on the shell operation with its CMD field focused", async () => {
		const { host, instance, session } = await mountApp()
		try {
			press(host, "!")
			await settle()
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("run")
			// The raw CMD field owns the keyboard, so the browser focuses it.
			expect(document.activeElement === host.querySelector(".panel-value")).toBe(true)
			type(host.querySelector(".panel-value"), "echo hi")
			await settle()
			expect(host.querySelector(".panel-runs pre").textContent).toBe("run 'echo hi'")
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

	test("typing in the filter re-anchors the cursor through setFilter", async () => {
		const { host, instance, session } = await mountApp()
		try {
			// Park the cursor off the first entry, then filter to a listing
			// whose only match is the first one.
			session.panes.left.cursor.set(1)
			session.filtering.set("left")
			await settle()
			type(host.querySelector(".pane-left .filter-input"), "tester")
			await settle()
			expect(session.panes.left.filter.value).toBe("tester")
			expect(session.panes.left.cursor.value).toBe(0)
		} finally {
			instance?.unmount?.()
		}
	})

	test("`u` opens the history overlay and `n` the mkdir panel", async () => {
		const { host, instance, session } = await mountApp()
		try {
			session.journal.record({ label: "mkdir demo", undo: async () => {}, redo: async () => {} })
			press(host, "u")
			await settle()
			expect(session.overlay.value).toBe("history")
			expect(host.querySelector(".overlay-list")).not.toBeNull()
			expect(host.textContent).toContain("mkdir demo")

			// Esc closes the overlay.
			press(host, "Escape")
			await settle()
			expect(session.overlay.value).toBeNull()

			// `n` opens the command panel on the mkdir operation.
			press(host, "n")
			await settle()
			expect(session.panelOpen.value).toBe(true)
			expect(session.panelEntry.value.name).toBe("mkdir")
		} finally {
			instance?.unmount?.()
		}
	})
})
