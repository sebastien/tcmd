import { describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { connectEffects, keepVisible } from "../../src/js/tcmd/web/effects.js"

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
