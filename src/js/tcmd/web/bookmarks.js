// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-13

// Module: tcmd/web/bookmarks
// The `core/bookmarks` store contract backed by localStorage
// (`createWebBookmarkStore`, the web twin of the TUI's
// `createFileBookmarkStore`). Backend/root namespaces keep browser-private and
// host-filesystem paths apart. Persistence is best-effort, just like the TUI
// store (private browsing may deny storage).

// Function: createWebBookmarkStore
function createWebBookmarkStore({ mode, root, storage } = {}) {
	const key = JSON.stringify(["tcmd.bookmarks", mode, root])
	return {
		async load() {
			try {
				return JSON.parse((storage ?? globalThis.localStorage).getItem(key) ?? "{}")
			} catch {
				return {}
			}
		},
		async save(map) {
			try {
				(storage ?? globalThis.localStorage).setItem(key, JSON.stringify(map))
			} catch {
				// Keep in-memory bookmarks usable when persistent storage is denied.
			}
		},
	}
}

export { createWebBookmarkStore }

// EOF
