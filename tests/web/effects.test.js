import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { applyPreviewScroll, connectEffects, keepVisible, resetPreviewScroll } from "../../src/js/tcmd/web/effects.js"

describe("web effects", () => {
	test("keeping a row visible scrolls only its own list", () => {
		const list = { clientHeight: 100, scrollTop: 50, getBoundingClientRect: () => ({ top: 20, bottom: 120 }) }
		keepVisible(list, { getBoundingClientRect: () => ({ top: 100, bottom: 140 }) })
		expect(list.scrollTop).toBe(70)
		keepVisible(list, { getBoundingClientRect: () => ({ top: 0, bottom: 20 }) })
		expect(list.scrollTop).toBe(50)
		keepVisible(list, { getBoundingClientRect: () => ({ top: 40, bottom: 60 }) })
		expect(list.scrollTop).toBe(50)
	})

	test("a new preview target sends the preview body back to the top", async () => {
		const { Window } = await import("happy-dom")
		const window = new Window()
		const doc = window.document
		const root = doc.createElement("div")
		const text = doc.createElement("pre")
		text.className = "preview-text"
		const card = doc.createElement("pre")
		card.className = "preview-card"
		root.append(text, card)
		doc.body.appendChild(root)
		const entry = cell({ path: "/a.txt" })
		const preview = cell({ title: "a.txt" })
		const session = {
			confirm: cell(null),
			panelOpen: cell(false),
			bookmarkOpen: cell(false),
			filtering: cell(null),
			previewEntry: entry,
			preview,
		}
		const effects = connectEffects(session, root, {
			size: cell({ width: 0, height: 0 }),
			help: cell(false),
			viewer: cell(false),
		})
		try {
			text.scrollTop = 30
			card.scrollTop = 12
			entry.set({ path: "/b.txt" })
			expect(text.scrollTop).toBe(0)
			expect(card.scrollTop).toBe(0)
			text.scrollTop = 20
			preview.set({ title: "b.txt" })
			expect(text.scrollTop).toBe(0)
			resetPreviewScroll(root)
			expect(text.scrollTop).toBe(0)
		} finally {
			effects.dispose()
			window.close()
		}
	})

	test("a preview scroll request moves the preview body", async () => {
		const { Window } = await import("happy-dom")
		const window = new Window()
		const doc = window.document
		const root = doc.createElement("div")
		const text = doc.createElement("pre")
		text.className = "preview-text"
		root.appendChild(text)
		doc.body.appendChild(root)
		const session = {
			confirm: cell(null),
			panelOpen: cell(false),
			bookmarkOpen: cell(false),
			filtering: cell(null),
			previewEntry: cell({ path: "/a.txt" }),
			preview: cell({ title: "a.txt" }),
			previewScroll: cell({ delta: 0, token: 0 }),
		}
		const effects = connectEffects(session, root, {
			size: cell({ width: 0, height: 0 }),
			help: cell(false),
			viewer: cell(false),
		})
		try {
			text.scrollTop = 5
			session.previewScroll.set({ delta: 2, token: 1 })
			expect(text.scrollTop).toBe(7)
			applyPreviewScroll(root, -3)
			expect(text.scrollTop).toBe(4)
			// The top edge clamps instead of going negative.
			applyPreviewScroll(root, -20)
			expect(text.scrollTop).toBe(0)
		} finally {
			effects.dispose()
			window.close()
		}
	})

	test("unmount cancels queued work and disconnects all browser listeners", async () => {
		const { Window } = await import("happy-dom")
		const window = new Window()
		const doc = window.document
		const root = doc.createElement("div")
		doc.body.appendChild(root)
		const callbacks = new Map()
		let next = 0
		window.requestAnimationFrame = (fn) => { callbacks.set(++next, fn); return next }
		window.cancelAnimationFrame = (id) => callbacks.delete(id)
		let disconnected = false
		window.ResizeObserver = class {
			observe() {}
			disconnect() { disconnected = true }
		}
		const session = Object.fromEntries(["confirm", "panelOpen", "bookmarkOpen", "filtering"].map((name) => [name, cell(false)]))
		const effects = connectEffects(session, root, { size: cell({ width: 0, height: 0 }), help: cell(false), viewer: cell(false) })
		expect(callbacks.size).toBe(1)
		effects.dispose()
		expect(callbacks.size).toBe(0)
		expect(disconnected).toBe(true)
		root.dispatchEvent(new window.Event("focusout"))
		doc.dispatchEvent(new window.Event("focusin"))
		window.dispatchEvent(new window.Event("resize"))
		expect(callbacks.size).toBe(0)
		const event = new window.KeyboardEvent("keydown", { key: "Tab", cancelable: true })
		root.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(false)
	})

	test("Backspace in the bookmark panel removes only with an empty filter", async () => {
		const { Window } = await import("happy-dom")
		const window = new Window()
		const root = window.document.createElement("div")
		const input = window.document.createElement("input")
		root.appendChild(input)
		window.document.body.appendChild(root)
		const session = {
			confirm: cell(null),
			panelOpen: cell(false),
			bookmarkOpen: cell(true),
			bookmarkQuery: cell(""),
			filtering: cell(null),
		}
		const effects = connectEffects(session, root, {
			size: cell({ width: 0, height: 0 }),
			help: cell(false),
			viewer: cell(false),
		})
		try {
			// An empty filter: Backspace removes the selected bookmark.
			const remove = new window.KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
			input.dispatchEvent(remove)
			expect(remove.defaultPrevented).toBe(true)

			// Text in the filter: Backspace edits the query.
			session.bookmarkQuery.set("note")
			const edit = new window.KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
			input.dispatchEvent(edit)
			expect(edit.defaultPrevented).toBe(false)

			// Delete removes whatever the filter contains.
			const del = new window.KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
			input.dispatchEvent(del)
			expect(del.defaultPrevented).toBe(true)
		} finally {
			effects.dispose()
			window.close()
		}
	})

	test("effects can start on a clone from an inert template document", async () => {
		const { Window } = await import("happy-dom")
		const window = new Window()
		const previous = globalThis.window
		globalThis.window = window
		try {
			const root = window.document.createElement("div")
			Object.defineProperty(root, "ownerDocument", { value: { defaultView: null } })
			const effects = connectEffects({}, root, { size: cell({ width: 0, height: 0 }), help: cell(false), viewer: cell(false) })
			effects.dispose()
		} finally {
			globalThis.window = previous
		}
	})
})
