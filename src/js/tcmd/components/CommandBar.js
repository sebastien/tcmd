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
// The web presentation swaps the key list for a single status line
// (`showKeys`/`showStatus`/`status`/`statusClass`); the TUI presentation keeps
// the key list and appends the status and the active pane's marked count as
// right-aligned zones (`statusPad`, `marksPad`, `marksFg`).
//
// Environment: `rows(data)` returning the keyed row list, `listClass` (web
// root class), `errorClass` (web), and the TUI colors `accentFg`,
// `accentSecondaryFg`, plus the error/warning/tip foreground/background pairs
// for the status badge.

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

// Function: commandBarMarks
// Count of marked entries in the active pane, for the status bar's right zone.
function commandBarMarks(data) {
	const active = unwrap(data?.active)
	const marked = active === "left" ? unwrap(data?.leftMarked) : unwrap(data?.rightMarked)
	const count = marked?.size ?? 0
	return count > 0 ? `${count} marked` : ""
}

// Function: isInfo
// True when the bar status comes from a non-error notice.
function isInfo(data) {
	const notice = unwrap(data?.notice)
	return Boolean(notice && notice.kind !== "error")
}

// Function: statusKind
// The notice kind driving the status (null when there is no notice).
function statusKind(data) {
	return unwrap(data?.notice)?.kind ?? null
}

// Function: createBehaviors
// Builds the CommandBar behavior map for the given renderer environment.
function createBehaviors(env) {
	const behaviors = {
		listClass: () => env?.listClass,
		marksFg: () => env?.accentSecondaryFg ?? env?.accentFg,
		// TUI: the active pane's marked count, or empty.
		marksPad: (_self, data) => {
			const text = commandBarMarks(data)
			return text ? ` ${text} ` : ""
		},
		showKeys: (_self, data) => !commandBarStatus(data),
		showStatus: (_self, data) => Boolean(commandBarStatus(data)),
		status: (_self, data) => commandBarStatus(data),
		statusBg: (_self, data) => {
			const kind = statusKind(data)
			if (kind === "warning") return env?.warningBg
			if (kind === "tip") return env?.tipBg
			if (kind === "error" || unwrap(data?.leftError) || unwrap(data?.rightError)) return env?.errorBg
			return undefined
		},
		statusClass: (_self, data) => (commandBarStatus(data) && !isInfo(data) ? env?.errorClass : null),
		statusFg: (_self, data) => {
			const kind = statusKind(data)
			if (kind === "warning") return env?.warningFg
			if (kind === "tip") return env?.tipFg
			if (kind === "error" || unwrap(data?.leftError) || unwrap(data?.rightError)) return env?.errorFg
			return env?.accentFg
		},
		// TUI: a padded status for the right zone, empty when all is well.
		statusPad: (_self, data) => {
			const text = commandBarStatus(data)
			return text ? ` ${text} ` : ""
		},
	}
	if (env?.rows) {
		behaviors.rows = (_self, data) => env.rows(self, data)
	}
	return behaviors
}

export { commandBarMarks, commandBarStatus, createBehaviors }

// EOF
