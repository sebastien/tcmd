// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-22

// Module: tcmd/core/permissions
// POSIX permission bits as the command panel edits them: the nine `u/g/o` ×
// `r/w/x` toggles `chmod` binds its MODE argument to. The tables are the single
// source of truth for the display order, the octal values and the `rwx`
// rendering; the panel projects them into rows and the argument row component
// renders the three cells of each class.
//
// Everything here is pure: the binding is the caller's, and the numeric/octal
// conversions do not mutate it.

// Constant: PERMISSION_CLASSES
// The permission classes in display order (owner, group, other).
const PERMISSION_CLASSES = [
	{ id: "u", label: "user" },
	{ id: "g", label: "group" },
	{ id: "o", label: "other" },
]

// Constant: PERMISSION_BITS
// The bits of each class in display order (read, write, execute).
const PERMISSION_BITS = [
	{ id: "r", label: "read" },
	{ id: "w", label: "write" },
	{ id: "x", label: "execute" },
]

// Constant: PERMISSION_VALUES
// The octal value of each `class:bit` key.
const PERMISSION_VALUES = {
	"u:r": 0o400, "u:w": 0o200, "u:x": 0o100,
	"g:r": 0o040, "g:w": 0o020, "g:x": 0o010,
	"o:r": 0o004, "o:w": 0o002, "o:x": 0o001,
}

// Function: permissionItems
// The nine `u/g/o` × `r/w/x` toggles for a permission argument, seeded from an
// existing file mode. Each item is a checkbox in the panel's item list: its
// `key` is the stable `class:bit` key the token builder reads back.
function permissionItems(mode) {
	const bits = Number(mode) & 0o777
	const items = []
	for (const permissionClass of PERMISSION_CLASSES) {
		for (const bit of PERMISSION_BITS) {
			const key = `${permissionClass.id}:${bit.id}`
			items.push({
				key,
				name: bit.label,
				parent: permissionClass.label,
				isDir: false,
				selected: (bits & PERMISSION_VALUES[key]) !== 0,
			})
		}
	}
	return items
}

// Function: permissionMode
// The numeric mode a permission binding currently selects.
function permissionMode(binding) {
	let mode = 0
	for (const item of binding?.items ?? []) {
		if (item.selected) mode |= PERMISSION_VALUES[item.key] ?? 0
	}
	return mode
}

// Function: permissionOctal
// The three-digit octal token a permission binding contributes to argv.
function permissionOctal(binding) {
	return permissionMode(binding).toString(8).padStart(3, "0")
}

// Function: permissionSymbolic
// The `rwx`-style rendering of a numeric mode.
function permissionSymbolic(mode) {
	return PERMISSION_CLASSES.map((permissionClass) =>
		PERMISSION_BITS.map((bit) =>
			mode & PERMISSION_VALUES[`${permissionClass.id}:${bit.id}`] ? bit.id : "-",
		).join(""),
	).join("")
}

// Function: permissionText
// The binding's value as the panel shows it: the octal mode and its symbolic
// form (`644 · rw-r--r--`).
function permissionText(binding) {
	const mode = permissionMode(binding)
	return `${permissionOctal(binding)} · ${permissionSymbolic(mode)}`
}

export {
	PERMISSION_BITS,
	PERMISSION_CLASSES,
	PERMISSION_VALUES,
	permissionItems,
	permissionMode,
	permissionOctal,
	permissionSymbolic,
	permissionText,
}

// EOF
