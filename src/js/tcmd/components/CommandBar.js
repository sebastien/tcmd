// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/CommandBar
// CommandBar: the bottom bar. By default it shows the keys available in the
// current context (the command registry's `bar` commands, or the palette
// hints while the palette is open); a pane error or a session notice takes
// its place. The row logic lives in `CommandItem.js`; this parent maps its
// `items` to rows.
//
// Environment: `rows(data)` returning the keyed row list, `listClass` (web
// root class), `statusFg` (TUI) and `errorClass` (web).

import { unwrap } from "select/state/cells"

// Function: commandBarStatus
// The one-line status the bar shows when something needs attention: the
// session notice first, then a pane error. Empty when everything is fine.
function commandBarStatus(data) {
	const notice = unwrap(data?.notice)
	if (notice) {
		const text = notice.text ?? `${notice}`
		return notice.kind === "error" ? `error: ${text}` : text
	}
	const error = unwrap(data?.leftError) ?? unwrap(data?.rightError)
	return error ? `error: ${error}` : ""
}

// Function: isInfo
// True when the bar status comes from a non-error notice.
function isInfo(data) {
	const notice = unwrap(data?.notice)
	return Boolean(notice && notice.kind !== "error")
}

// Function: createBehaviors
// Builds the CommandBar behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		listClass: () => env?.listClass,
		showKeys: (_self, data) => !commandBarStatus(data),
		showStatus: (_self, data) => Boolean(commandBarStatus(data)),
		status: (_self, data) => commandBarStatus(data),
		statusClass: (_self, data) => (commandBarStatus(data) && !isInfo(data) ? env?.errorClass : null),
		statusFg: (_self, data) => (isInfo(data) ? env?.accentFg : env?.errorFg),
	}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(data)
	}
	return behaviors
}

export { commandBarStatus, createBehaviors }

// EOF
