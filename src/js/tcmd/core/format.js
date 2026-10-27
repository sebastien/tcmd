// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-31

// Module: tcmd/core/format
// Domain-level formatting of byte sizes and filesystem capacity. These live in
// core, not components, because operations report sizes too (`stat`, `du`,
// `df`); the component formatters re-export them so every renderer and every
// operation shares one wording.

// Function: formatSize
// Human-readable byte size, e.g. "512B", "2.0K", "3.8M".
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

export { formatDisk, formatSize }

// EOF
