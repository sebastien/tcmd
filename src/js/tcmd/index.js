// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd
// Public surface of the UI-agnostic core. The TUI lives in `tcmd/tui`, a web
// UI will live in `tcmd/web`; both consume only what is exported here.
import * as core from "./core/index.js"

export default core
export {
	DEFAULT_KEYMAP,
	SEP,
	basename,
	clampCursor,
	createDispatch,
	createNodeFs,
	createPane,
	createSession,
	currentEntry,
	filterEntries,
	getCommand,
	getCommands,
	join,
	load,
	matchKeymap,
	moveCursor,
	normalize,
	parent,
	prefix,
	sortEntries,
	split,
	toggleMark,
} from "./core/index.js"

// EOF
