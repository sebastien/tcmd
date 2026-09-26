// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/read
// Unwraps a reactive cell to its plain value; plain values pass through
// unchanged. Both backends keep cells in component data (select.js semantics),
// so behaviors resolve cells at the point of use instead of relying on one
// renderer to normalize them. `read()` is a no-op on plain data, which keeps
// the same component logic valid on select.js and select.tui.

// Function: read
// Returns `value.value` for a reactive cell, else `value`.
function read(value) {
	return value?.isReactive ? value.value : value
}

export { read }
