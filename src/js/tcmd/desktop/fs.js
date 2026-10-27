// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/fs
// Frontend adapter: forward the shared core's filesystem contract over named
// tinyjs RPC calls. `createDesktopFs` is async because it caches immutable
// home/cwd/root values required by the synchronous adapter getters. Raw
// bytes cross the bridge base64-encoded, like the web API.

import { decodeBase64 } from "../core/base64.js"

// Function: createDesktopFs
// Builds the adapter over the tinyjs RPC bridge. `on` subscribes to backend
// push events (the native watcher); without it the adapter reports no `watch`
// and `core/watch` falls back to polling.
function createDesktopFs({ call, on }) {
	if (typeof call !== "function") throw new TypeError("an RPC call function is required")
	const watching = typeof on === "function"
	// One backend channel carries every watcher; ids tell them apart and a
	// page reload restarts the sequence after `fsWatchReset` closes the old
	// page's watchers.
	const watchHandlers = new Map()
	// A per-page prefix keeps ids unique across windows: `app.push` broadcasts
	// every `fs-change` to all of them, and a fixed sequence would make two
	// windows mistake each other's watcher events for their own.
	const watchPrefix = Math.random().toString(36).slice(2, 8)
	let watchSeq = 0
	return (async () => {
		const info = await call("fsInfo")
		if (watching) {
			on("fs-change", (payload) => {
				const id = payload?.id
				if (id != null) watchHandlers.get(id)?.()
			})
			await call("fsWatchReset").catch(() => {})
		}
		return {
			readDir: (path) => call("fsReadDir", { path }),
			stat: (path) => call("fsStat", { path }),
			realpath: (path) => call("fsRealpath", { path }),
			isDir: async (path) => Boolean((await call("fsStat", { path }))?.isDir),
			readTextHead: (path, maxBytes) => call("fsReadTextHead", { path, maxBytes }),
			readBytes: async (path, maxBytes) =>
				decodeBase64((await call("fsReadBytes", { path, maxBytes })).base64),
			du: (path) => call("fsDu", { path }),
			disk: (path) => call("fsDisk", { path }),
			copy: (from, to) => call("fsCopy", { from, to }),
			move: (from, to) => call("fsMove", { from, to }),
			hardlink: (from, to) => call("fsHardlink", { from, to }),
			symlink: (target, link) => call("fsSymlink", { target, link }),
			chmod: (path, mode) => call("fsChmod", { path, mode }),
			chown: (path, owner) => call("fsChown", { path, owner }),
			unlink: (path) => call("fsUnlink", { path }),
			trash: (paths) => call("fsTrash", { paths }),
			trashList: () => call("fsTrashList"),
			restore: (paths) => call("fsRestore", { paths }),
			erase: (paths) => call("fsErase", { paths }),
			touch: (path) => call("fsTouch", { path }),
			mkdir: (path) => call("fsMkdir", { path }),
			// Function: watch
			// Registers a native directory watcher in the backend. Resolves to
			// its stop, or null when the bridge cannot watch the path — which
			// sends `core/watch` to its polling fallback.
			async watch(path, onChange) {
				if (!watching) return null
				const id = `${watchPrefix}-${++watchSeq}`
				watchHandlers.set(id, onChange)
				try {
					await call("fsWatch", { path, id })
				} catch (error) {
					watchHandlers.delete(id)
					return null
				}
				let stopped = false
				return () => {
					if (stopped) return
					stopped = true
					watchHandlers.delete(id)
					void Promise.resolve(call("fsUnwatch", { id })).catch(() => {})
				}
			},
			home: () => info.home,
			cwd: () => info.cwd,
			root: () => info.root,
			host: () => info.host,
		}
	})()
}

export { createDesktopFs }

// EOF
