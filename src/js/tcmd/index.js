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
	createLabels,
	createNodeFs,
	createNodeOs,
	createNullOs,
	createPane,
	createSession,
	createTab,
	currentEntry,
	expandAll,
	expandArg,
	extname,
	filterEntries,
	getCommand,
	getCommands,
	getOperation,
	getOperations,
	join,
	load,
	matchKeymap,
	moveCursor,
	normalize,
	parent,
	parseLine,
	prefix,
	rankEntries,
	runLine,
	scriptItems,
	sortEntries,
	split,
	toggleMark,
	tokenize,
	viewEntries,
} from "./core/index.js"
