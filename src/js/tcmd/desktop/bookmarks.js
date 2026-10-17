// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/bookmarks
// Persist the shared bookmark model in tinyjs's per-application settings store
// rather than browser localStorage or the TUI's config file.

function createDesktopBookmarkStore({ store, key = "tcmd.bookmarks.v1" } = {}) {
	if (!store?.get || !store?.set) throw new TypeError("tinyjs store API is required")
	return {
		async load() {
			const value = await store.get(key)
			return value && typeof value === "object" && !Array.isArray(value) ? value : {}
		},
		async save(map) {
			const saved = await store.set(key, map)
			if (saved === false) throw new Error("Could not save bookmarks to application storage")
		},
	}
}

export { createDesktopBookmarkStore }

// EOF
