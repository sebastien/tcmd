// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-22

// Module: tcmd/core/picker
// The command panel's file picker: the private pane the panel browses while a
// `dest`/`path` argument is being filled. The picker owns its editable path
// text, the directory that text resolves against, the visible listing and the
// queue that keeps fast typing from landing an older navigation after a newer
// one. State cells live on the session (see `core/session`); this module holds
// the path rules and the row shaping so `core/panel` stays about argument
// binding.

import { basename, join, normalize, parent } from "./path.js"

// Function: pickerAbsolutePath
// Resolves the picker's editable path text: `~`, an absolute path, or a path
// relative to `base` (the directory the picker was opened from).
function pickerAbsolutePath(text, base = "/", home = "/") {
	const raw = `${text ?? ""}`
	if (!raw) return normalize(base || "/")
	if (raw === "~") return normalize(home || "/")
	if (raw.startsWith("~/")) return join(home, raw.slice(2))
	if (raw.startsWith("/")) return normalize(raw)
	return join(base || "/", raw)
}

// Function: pickerDirectoryText
// The path input's display form: a trailing slash marks a directory, so typing
// after it starts a child name (the same affordance a shell prompt gives).
function pickerDirectoryText(path) {
	const normalized = normalize(path)
	return normalized === "/" ? "/" : `${normalized}/`
}

// Function: resolvePickerPath
// Interprets the editable path text as `{ directory, query }`: an existing
// directory lists its contents, an existing file keeps its parent listing with
// the file as the filter, and a missing path walks up to the closest existing
// directory while the dropped segment becomes the filter. This is what makes
// typing `/home/do` show the matching entries under `/home`.
async function resolvePickerPath(fs, text, base = "/", home = "/") {
	const raw = `${text ?? ""}`
	const absolute = pickerAbsolutePath(raw, base, home)
	const stats = await fs.stat(absolute)
	if (stats?.isDir) return { directory: absolute, query: "" }
	if (stats) return { directory: parent(absolute) ?? "/", query: basename(absolute) }

	const trailing = raw.endsWith("/")
	let directory = trailing ? absolute : parent(absolute) ?? "/"
	const rest = trailing ? [] : [basename(absolute)]
	while (directory !== "/") {
		if ((await fs.stat(directory))?.isDir) break
		rest.unshift(basename(directory))
		directory = parent(directory) ?? "/"
	}
	return { directory, query: rest[0] ?? "" }
}

// Function: pickerVisibleEntries
// The entries the picker lists for a mode: a destination picker lists
// directories only, so every row is a valid choice; a file/any picker keeps the
// listing intact, where a directory row descends.
function pickerVisibleEntries(entries, mode) {
	return mode === "dir" ? (entries ?? []).filter((entry) => entry.isDir) : entries ?? []
}

// Function: pickerRowList
// Flattens the picker's visible listing into the rows the picker renders. The
// `..` parent navigation row stays at the top when filtering and is omitted at
// the filesystem root; entry rows keep the listing details (size, mode, link
// target) so they render exactly like a file panel.
function pickerRowList(entries, path) {
	const rows = []
	const parentPath = parent(path)
	if (parentPath) {
		rows.push({
			type: "parent",
			key: `parent:${path}`,
			name: "..",
			path: parentPath,
			isDir: true,
			isSymlink: false,
			isDevice: false,
			isParent: true,
			target: null,
			size: 0,
			mode: 0,
			ext: null,
		})
	}
	for (const entry of entries ?? []) {
		rows.push({ ...entry, type: "entry", key: entry.path })
	}
	return rows
}

// Function: createPickerPathQueue
// Creates the picker's path-resolution queue for one session. `invalidate`
// drops any queued work before an explicit navigation or close; `schedule`
// resolves one path text and applies the resulting directory and filter. Work
// is serialized so fast typing cannot land an older navigation after a newer
// one, and a token drops every intermediate keystroke.
function createPickerPathQueue(session) {
	let version = 0
	let queue = Promise.resolve()
	return {
		invalidate() {
			version += 1
		},
		schedule(text) {
			if (!session.pickerOpen.value) return
			const token = ++version
			queue = queue
				.then(async () => {
					if (token !== version || !session.pickerOpen.value) return
					const base = session.pickerBasePath.value || session.pickerPane.path.value || "/"
					const { directory, query } = await resolvePickerPath(
						session.fs,
						text,
						base,
						session.fs.home?.() ?? "/",
					)
					if (token !== version || session.pickerPathText.value !== text) return
					if (session.pickerPane.path.value !== directory) {
						await session.pickerPane.navigate(directory, { record: false })
					}
					if (token !== version || session.pickerPathText.value !== text) return
					session.pickerQuery.set(query)
					const rows = session.pickerRows.value
					const firstMatch = query ? rows.findIndex((row) => row.type === "entry") : 0
					session.panelRowIndex.set(firstMatch >= 0 ? firstMatch : 0)
				})
				.catch((error) => {
					// Keep the queue alive after an unreadable path; the picker
					// keeps the last listing and the command bar reports what
					// failed.
					if (token === version) {
						session.notice?.set({ kind: "warning", text: `${error?.message ?? error}` })
					}
				})
		},
	}
}

export {
	createPickerPathQueue,
	pickerAbsolutePath,
	pickerDirectoryText,
	pickerRowList,
	pickerVisibleEntries,
	resolvePickerPath,
}

// EOF
