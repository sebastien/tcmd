// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/format
// Presentation-only formatting helpers (sizes, counts, header title) shared by
// every component for every renderer.

// Function: formatTitle
// Header line `TinyCmd - HOST DIR/BASE` for the given directory. When it
// exceeds `width` columns the path's middle segments collapse to their first
// letter, left to right, keeping the basename (`/home/seb/app` -> `/h/s/app`).
// `host` is optional; `width <= 0` means "unknown width" and disables
// compression.
function formatTitle(host, path, width) {
	const lead = host ? `TinyCmd - ${host} ` : "TinyCmd - "
	const parts = `${path ?? ""}`.split("/").filter(Boolean)
	let text = `${lead}/${parts.join("/")}`
	if (width <= 0 || text.length <= width) return text
	// Collapse middle segments (every segment but the basename), one at a time.
	for (let i = 0; i < parts.length - 1; i++) {
		parts[i] = parts[i][0]
		text = `${lead}/${parts.join("/")}`
		if (text.length <= width) return text
	}
	// Still too wide: drop leading segments, then hard-truncate.
	let rest = parts
	while (rest.length > 1) {
		rest = rest.slice(1)
		text = `${lead}…/${rest.join("/")}`
		if (text.length <= width) return text
	}
	return `${text.slice(0, Math.max(0, width - 1))}…`
}

// Function: crumbSpan
// Columns a breadcrumb segment occupies: the root "/" is one column; a name
// is its width plus one for the "/" separator, except the basename (the last
// segment) which carries no separator.
function crumbSpan(segment, isLast) {
	if (isRootish(segment)) return 1
	return `${segment.name}`.length + (isLast ? 0 : 1)
}

// Function: isRootish
// True for the leading "/" segment.
function isRootish(segment) {
	return segment?.path === "/"
}

// Function: elideCrumbs
// Width-aware breadcrumb segments. Full names while they fit `width`
// columns; then the leftmost middle segments collapse to their first letter
// (original case, e.g. Workspace -> W) one at a time, basename last; then —
// only when even one letter per segment cannot fit — leading segments are
// dropped behind a "…" marker. Every remaining segment keeps at least one
// letter and every "/" survives, so the strip stays clickable end to end.
// `width <= 0` (unknown, web) returns the segments untouched.
function elideCrumbs(segments, width) {
	const list = segments ?? []
	if (width <= 0 || list.length === 0) return list
	const measure = (segs) =>
		segs.reduce((cols, segment, i) => cols + crumbSpan(segment, i === segs.length - 1), 0)
	if (measure(list) <= width) return list
	// Collapse leftmost non-root segments to one letter; the basename stays.
	const collapsed = list.map((segment) => ({ ...segment }))
	for (let i = 1; i < collapsed.length - 1; i++) {
		collapsed[i] = { ...collapsed[i], name: `${collapsed[i].name}`.slice(0, 1) }
		if (measure(collapsed) <= width) return collapsed
	}
	// Even one letter each cannot fit: drop leading segments behind a "…".
	const marker = { name: "…", path: null }
	let rest = collapsed.slice(1)
	while (rest.length > 1 && measure([marker, ...rest]) > width) {
		rest = rest.slice(1)
	}
	return [marker, ...rest]
}

// Function: formatSize
// Human-readable byte size; directories pass through their own label.
function formatSize(bytes) {
	const value = Number(bytes ?? 0)
	if (value < 1024) return `${value}B`
	const units = ["K", "M", "G", "T"]
	let size = value / 1024
	let unit = 0
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024
		unit++
	}
	return `${size >= 100 ? Math.round(size) : size.toFixed(1)}${units[unit]}`
}

// Function: formatDisk
// Compact free/total disk line, e.g. "12G free of 256G".
function formatDisk(disk) {
	if (!disk) return ""
	return `${formatSize(disk.free)} free of ${formatSize(disk.total)}`
}

// Function: formatTime
// Local `YYYY-MM-DD HH:MM` stamp for a millisecond epoch; empty when absent.
function formatTime(ms) {
	const value = Number(ms)
	if (!Number.isFinite(value) || value <= 0) return ""
	const date = new Date(value)
	const pad = (n) => `${n}`.padStart(2, "0")
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Function: formatMode
// POSIX permission string ("-rw-r--r--", "drwxr-xr-x") from a stat mode; empty
// when the backend does not provide one. The leading character reflects the
// file type and the setuid/setgid/sticky bits replace the execute slot.
function formatMode(mode) {
	if (!Number.isFinite(mode) || mode <= 0) return ""
	const type = mode & 0o170000
	const fileType = type === 0o040000 ? "d" : type === 0o120000 ? "l" : type === 0o020000 ? "c" : type === 0o060000 ? "b" : type === 0o010000 ? "p" : "-"
	const bits = mode & 0o7777
	const triple = (shift, special, set, unset) => {
		const part = (bits >> shift) & 7
		const exec = part & 1 ? "x" : "-"
		const execSpecial = special ? (exec === "x" ? set : unset) : exec
		return `${part & 4 ? "r" : "-"}${part & 2 ? "w" : "-"}${execSpecial}`
	}
	return (
		fileType +
		triple(6, bits & 0o4000, "s", "S") +
		triple(3, bits & 0o2000, "s", "S") +
		triple(0, bits & 0o1000, "t", "T")
	)
}

// Function: formatCounts
// Summary counts line: "3 dirs, 12 files, 4.2K".
function formatCounts(entries) {
	let dirs = 0
	let files = 0
	let bytes = 0
	const list = entries ?? []
	for (let i = 0; i < list.length; i++) {
		if (list[i].isDir) dirs++
		else {
			files++
			bytes += list[i].size ?? 0
		}
	}
	return `${dirs} dirs, ${files} files, ${formatSize(bytes)}`
}

export { elideCrumbs, formatCounts, formatDisk, formatMode, formatSize, formatTime, formatTitle }

// EOF
