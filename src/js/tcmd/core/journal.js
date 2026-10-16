// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-17

// Module: tcmd/core/journal
// The undo/redo journal: an ordered list of applied file operations, each
// carrying an inverse (`undo`) and a forward (`redo`) action. `index` points at
// the last *applied* entry; entries after it are undone and can be redone.
// `record` appends and truncates any redo tail (a new action forks history), so
// the model is a plain linear history like a text editor's.
//
// Actions are closures over the paths an operation touched, so the journal is
// session-only (not persisted): a fresh session starts empty. `rows()` projects
// the entries for the history panel, marking which are applied and where the
// pointer sits.

import { cell } from "select/state/cells"

// Function: createJournal
// Creates an empty journal. `entries` is the ordered action list (oldest
// first); `index` is the last applied entry (-1 when nothing is applied).
function createJournal({ entries = [], index = -1 } = {}) {
	const journal = {}
	journal.entries = cell(entries.slice())
	journal.index = cell(Math.min(index, entries.length - 1))
	let sequence = entries.length

	// Function: record
	// Appends `entry` — `{ label, undo?, redo? }` — discarding any undone tail,
	// and moves the pointer onto it. Returns the entry's id.
	journal.record = (entry) => {
		const kept = journal.entries.value.slice(0, journal.index.value + 1)
		const recorded = { id: ++sequence, at: Date.now(), ...entry }
		kept.push(recorded)
		journal.entries.set(kept)
		journal.index.set(kept.length - 1)
		return recorded.id
	}

	// Function: canUndo / canRedo
	journal.canUndo = () => journal.index.value >= 0
	journal.canRedo = () => journal.index.value < journal.entries.value.length - 1

	// Function: undo
	// Runs the inverse of the entry at the pointer and steps back. Returns the
	// entry, or null when there is nothing to undo.
	journal.undo = async (session) => {
		if (!journal.canUndo()) return null
		const entry = journal.entries.value[journal.index.value]
		await entry?.undo?.(session)
		journal.index.set(journal.index.value - 1)
		return entry
	}

	// Function: redo
	// Re-applies the next undone entry and steps onto it. Returns the entry, or
	// null when there is nothing to redo.
	journal.redo = async (session) => {
		if (!journal.canRedo()) return null
		const next = journal.index.value + 1
		const entry = journal.entries.value[next]
		await entry?.redo?.(session)
		journal.index.set(next)
		return entry
	}

	// Function: goTo
	// Undoes or redoes repeated until the pointer sits on `target` (-1 empties
	// the applied set). Used by the history panel to jump to an entry.
	journal.goTo = async (session, target) => {
		while (journal.index.value > target && journal.canUndo()) await journal.undo(session)
		while (journal.index.value < target && journal.canRedo()) await journal.redo(session)
	}

	// Function: rows
	// Panel rows, oldest first: `{ id, label, at, index, applied, current }`.
	journal.rows = () =>
		journal.entries.value.map((entry, i) => ({
			id: entry.id,
			label: entry.label,
			at: entry.at,
			index: i,
			applied: i <= journal.index.value,
			current: i === journal.index.value,
		}))

	return journal
}

export { createJournal }

// EOF
