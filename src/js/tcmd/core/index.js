// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core
// UI-agnostic model and controller for TinyCommand. This layer has no
// rendering dependencies (no OpenTUI, no select.tui, no DOM) so both the TUI
// and a future web UI can share it. State is expressed as reactive cells from
// `select/state/cells`; the filesystem and host adapters are injectable
// (core/fs, core/os).

export { createNodeFs } from "./fs.js"
export { createNullOs, createNodeOs } from "./os.js"
export { filterEntries, rankEntries, sortEntries, viewEntries } from "./entries.js"
export { clampCursor, currentEntry, moveCursor, toggleMark } from "./selection.js"
export { PANE_BUFFERS, PANE_LABELS, createPane } from "./pane.js"
export { createDirectory } from "./directory.js"
export {
	createBookmarks,
	createFileBookmarkStore,
	createMemoryBookmarkStore,
	isValidName,
	normalizeName,
} from "./bookmarks.js"
export { DEFAULT_KEYMAP, matchKeymap } from "./keymap.js"
export { createDispatch, getCommand, getCommands } from "./commands.js"
export { expandAll, expandArg, decodePathToken, getOperation, getOperations, pathToken, runOperation } from "./operations.js"
export {
	PANEL_FOCUS,
	argvFor,
	bindArgs,
	panelOperations,
	panelRowList,
	paneSelectionPaths,
} from "./panel.js"
export { parseLine, runLine, scriptItems, tokenize } from "./script.js"
export { createSession, load } from "./session.js"
export { SEP, basename, extname, join, normalize, parent, prefix, split } from "./path.js"
