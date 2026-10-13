// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-14

// Module: tcmd/core/history
// A browser-like history over snapshots: a stack with a cursor (`index`) into
// it. `push` truncates the forward branch, `back`/`forward` move the cursor and
// return the snapshot to restore, and `replace` updates the current entry in
// place. Pure bookkeeping — callers own what a snapshot contains and how to
// apply it.

// Function: createHistory
// Creates a history seeded with `initial` and the cursor on it.
function createHistory(initial) {
	const stack = [initial]
	let index = 0
	return {
		stack,
		get index() {
			return index
		},
		// Function: current
		// The snapshot the cursor is on.
		current: () => stack[index],
		// Function: push
		// Records `snapshot` after the cursor, dropping the forward branch.
		push(snapshot) {
			stack.length = index + 1
			stack.push(snapshot)
			index = stack.length - 1
		},
		// Function: replace
		// Updates the current entry in place, so a later return restores the
		// state as it was left (moved cursor, marks, filter).
		replace(snapshot) {
			stack[index] = snapshot
		},
		// Function: back
		// Moves one entry back and returns its snapshot, or null at the start.
		back() {
			if (index <= 0) return null
			index -= 1
			return stack[index]
		},
		// Function: forward
		// Moves one entry forward and returns its snapshot, or null at the end.
		forward() {
			if (index >= stack.length - 1) return null
			index += 1
			return stack[index]
		},
	}
}

export { createHistory }

// EOF
