import { beforeAll, describe, expect, test } from "bun:test"
import { createMockFs } from "../helpers/mock-fs.js"

let startApp
beforeAll(async () => {
	const { Window } = await import("happy-dom")
	const window = new Window()
	for (const key of ["document", "DOMParser", "Node", "HTMLElement", "customElements", "location", "navigator", "Event", "MouseEvent"]) {
		globalThis[key] = window[key]
	}
	globalThis.window = window
	;({ startApp } = await import("../../src/js/tcmd/desktop/main.js"))
})

async function mountDesktop({ failQuit = false } = {}) {
	const fs = createMockFs({ "/": [{ name: "folder", isDir: true }], "/folder": [] })
	const host = document.createElement("div")
	host.id = "app"
	document.body.append(host)
	const saved = []
	const errors = []
	let quits = 0
	let stoppedOpenFiles = 0
	let stoppedDrop = 0
	const tiny = {
		api: {
			async call(method, params) {
				if (method === "fsInfo") return { home: "/", cwd: "/", root: "/", host: "test" }
				if (method === "fsTakeOpenFiles") return []
				const name = method.slice(2)
				const operation = name[0].toLowerCase() + name.slice(1)
				return fs[operation](params.path, params.maxBytes)
			},
			on() { return () => stoppedOpenFiles++ },
		},
		store: {
			async get() { return null },
			async set(key, value) { saved.push({ key, value }); return true },
		},
		win: {
			onDrop() { return () => stoppedDrop++ },
		},
		dialog: { async alert(title, message) { errors.push({ title, message }) } },
		async quit() {
			quits++
			if (failQuit) throw new Error("native quit failed")
		},
	}
	const app = await startApp({ host, doc: document, tiny })
	const pressQuit = () => host.querySelector(".app").dispatchEvent(
		new window.KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true }),
	)
	return { app, host, saved, errors, pressQuit, counts: () => ({ quits, stoppedOpenFiles, stoppedDrop }) }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80))

describe("desktop lifecycle", () => {
	test("Quit saves the current workspace, closes the native app, and cleans up once", async () => {
		const desktop = await mountDesktop()
		try {
			await desktop.app.session.panes.left.navigate("/folder")
			desktop.pressQuit()
			desktop.pressQuit()
			await settle()
			expect(desktop.counts()).toEqual({ quits: 1, stoppedOpenFiles: 1, stoppedDrop: 1 })
			expect(desktop.saved.at(-1).value.left).toBe("/folder")
			expect(desktop.host.querySelector(".app")).toBeNull()
			desktop.app.dispose()
			expect(desktop.counts()).toEqual({ quits: 1, stoppedOpenFiles: 1, stoppedDrop: 1 })
			const saves = desktop.saved.length
			desktop.app.session.viewMode.set("commander")
			await new Promise((resolve) => setTimeout(resolve, 400))
			expect(desktop.saved).toHaveLength(saves)
		} finally {
			desktop.app.dispose()
			desktop.host.remove()
		}
	})

	test("a failed native Quit reports the error without blanking the window", async () => {
		const desktop = await mountDesktop({ failQuit: true })
		try {
			desktop.pressQuit()
			await settle()
			expect(desktop.host.querySelector(".app")).not.toBeNull()
			expect(desktop.errors).toEqual([{ title: "Could not quit TinyCommand", message: "native quit failed" }])
			expect(desktop.counts()).toEqual({ quits: 1, stoppedOpenFiles: 0, stoppedDrop: 0 })
		} finally {
			desktop.app.dispose()
			desktop.host.remove()
		}
	})
})
