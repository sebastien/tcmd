// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core
// UI-agnostic model and controller for TinyCommand. This layer has no
// rendering dependencies (no OpenTUI, no select.tui, no DOM) so both the TUI
// and a future web UI can share it. State is expressed as reactive cells from
// `select/state/cells`; the filesystem is an injectable adapter (core/fs).

export { createNodeFs } from "./fs.js"
export { filterEntries, sortEntries } from "./entries.js"
export { clampCursor, currentEntry, moveCursor, toggleMark } from "./selection.js"
export { createPane } from "./pane.js"
export { DEFAULT_KEYMAP, matchKeymap } from "./keymap.js"
export { createDispatch, getCommand, getCommands } from "./commands.js"
export { createSession, load } from "./session.js"
export { SEP, basename, join, normalize, parent, prefix, split } from "./path.js"

// EOF
