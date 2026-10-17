// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/main
// tinyjs frontend bootstrap. This deliberately bypasses the browser entry's
// OPFS/HTTP backend selection and mounts the existing DOM UI over the native
// filesystem and host adapters.

import { effect } from "select/state/cells"
import { createBookmarks } from "../core/bookmarks.js"
import { parent } from "../core/path.js"
import { createPane } from "../core/pane.js"
import { createSession, load } from "../core/session.js"
import { main as mount } from "../web/index.js"
import { createDesktopBookmarkStore } from "./bookmarks.js"
import { createDesktopFs } from "./fs.js"
import { createDesktopOs } from "./os.js"

const WORKSPACE_KEY = "tcmd.workspace.v1"

function showError(tiny, title, error) {
	const message = error?.message ?? `${error}`
	return tiny.dialog.alert(title, message).catch(() => {})
}

function start({ doc = globalThis.document, tiny = globalThis.tiny } = {}) {
	const host = doc?.querySelector?.("#app")
	if (!host) throw new Error("TinyCommand desktop page is missing #app")
	if (!tiny?.api?.call) throw new Error("TinyCommand needs the tinyjs API bridge")
	return startApp({ host, doc, tiny })
}

async function startApp({ host, doc, tiny }) {
	let stopOpenFiles = null
	let ready = false
	let flushPromise = null
	let flushRequested = false
	let session = null
	let fs = null
	let instance = null
	let stopWorkspaceEffect = null
	let stopDrop = null
	let saveTimer = null
	let disposed = false
	let quitting = false
	function dispose() {
		if (disposed) return
		disposed = true
		ready = false
		clearTimeout(saveTimer)
		stopOpenFiles?.()
		stopDrop?.()
		stopWorkspaceEffect?.()
		instance?.unmount?.()
	}
	const call = (method, params) => tiny.api.call(method, params)
	const flushOpenFiles = () => {
		if (!ready) return Promise.resolve()
		flushRequested = true
		if (flushPromise) return flushPromise
		flushPromise = (async () => {
			while (ready && flushRequested) {
				flushRequested = false
				const paths = await call("fsTakeOpenFiles")
				if (paths?.length) await openPaths(paths)
			}
		})()
			.catch((error) => showError(tiny, "Could not open folder", error))
			.finally(() => {
				flushPromise = null
				if (ready && flushRequested) return flushOpenFiles()
			})
		return flushPromise
	}
	stopOpenFiles = tiny.api.on("open-files", () => {
		if (ready) void flushOpenFiles()
	})

	async function openPaths(paths) {
		for (const rawPath of paths ?? []) {
			if (typeof rawPath !== "string" || !rawPath) continue
			const stats = await fs.stat(rawPath)
			if (!stats) continue
			const folder = stats.isDir ? rawPath : parent(rawPath)
			session.active.set("left")
			await session.panes.left.navigate(folder, { cursorPath: stats.isDir ? null : rawPath })
			return rawPath
		}
		throw new Error("The requested folder or file no longer exists")
	}

	async function chooseFolder() {
		const path = await tiny.dialog.pickFolder()
		if (path) await openPaths([path])
	}

	try {
		fs = await createDesktopFs({ call })
		const saved = await tiny.store.get(WORKSPACE_KEY).catch(() => null)
		const validDirectory = async (value) => {
			if (typeof value !== "string") return null
			return await fs.isDir(value).catch(() => false) ? value : null
		}
		const home = fs.home()
		const leftPath = (await validDirectory(saved?.left)) ?? home
		const rightPath = (await validDirectory(saved?.right)) ?? home
		const viewMode = saved?.viewMode === "commander" ? "commander" : "explorer"
		const left = createPane({ fs, path: leftPath })
		const right = createPane({ fs, path: rightPath })
		const bookmarks = createBookmarks({
			store: createDesktopBookmarkStore({ store: tiny.store }),
		})
		session = createSession({
			fs,
			os: createDesktopOs({ call, tiny }),
			left,
			right,
			host: fs.host(),
			bookmarks,
			viewMode,
		})
		await load(session)
		instance = mount(session, "#app", {
			desktopMode: true,
			onQuit: quit,
			onOpenFolder: chooseFolder,
			onError: (error) => showError(tiny, "TinyCommand", error),
		})
		doc.title = "TinyCommand"
		tiny.win.setTitle?.("TinyCommand")
		tiny.win.setMinSize?.(900, 640)

		let warnedAboutStorage = false
		const saveWorkspace = async (leftLocation, rightLocation, mode) => {
			try {
				const savedOk = await tiny.store.set(WORKSPACE_KEY, {
					left: leftLocation,
					right: rightLocation,
					viewMode: mode,
				})
				if (savedOk === false && !warnedAboutStorage) {
					warnedAboutStorage = true
					session.notice.set({ kind: "warning", text: "Could not save the workspace settings" })
				}
			} catch (error) {
				if (!warnedAboutStorage) {
					warnedAboutStorage = true
					session.notice.set({ kind: "warning", text: `Could not save workspace settings: ${error.message}` })
				}
			}
		}
		async function quit() {
			if (quitting || disposed) return
			quitting = true
			clearTimeout(saveTimer)
			try {
				await saveWorkspace(left.path.value, right.path.value, session.viewMode.value)
				await tiny.quit()
				dispose()
			} catch (error) {
				quitting = false
				await showError(tiny, "Could not quit TinyCommand", error)
			}
		}
		stopWorkspaceEffect = effect([left.path, right.path, session.viewMode], ([leftLocation, rightLocation, mode]) => {
			if (!ready) return
			clearTimeout(saveTimer)
			saveTimer = setTimeout(() => void saveWorkspace(leftLocation, rightLocation, mode), 350)
		})
		ready = true
		await saveWorkspace(left.path.value, right.path.value, session.viewMode.value)
		stopDrop = tiny.win.onDrop?.((paths) => {
			void openPaths(paths).catch((error) => showError(tiny, "Could not open dropped item", error))
		})
		await flushOpenFiles()
		return {
			fs,
			session,
			instance,
			dispose,
		}
	} catch (error) {
		dispose()
		host.textContent = `TinyCommand desktop could not start: ${error?.message ?? error}`
		throw error
	}
}

if (globalThis.document && globalThis.tiny) {
	void start().catch((error) => console.error("TinyCommand desktop startup failed", error))
}

export { start, startApp, WORKSPACE_KEY }

// EOF
