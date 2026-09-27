// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/format
// Presentation-only formatting helpers (sizes, counts) shared by every
// component for every renderer.

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

export { formatCounts, formatDisk, formatSize }

// EOF
