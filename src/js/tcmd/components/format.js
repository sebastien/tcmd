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

export { formatCounts, formatDisk, formatSize, formatTitle }

// EOF
