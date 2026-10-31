// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/CommandBar
// CommandBar: the bottom bar. By default it shows the keys available in the
// current context (the rows composed by `core/bar`, or the hints of the
// overlay that owns the keyboard); a pane error or a session notice takes
// its place. Entries are bracket shorthands (see `CommandItem.js`) that stay
// on one line: entries that do not fit are dropped and a trailing ellipsis
// takes their place, while the focused listing's marked count joins the list
// as a dimmed, non-clickable entry. The row logic lives in `CommandItem.js`;
// this parent maps its `items` to rows.
//
// The web presentation swaps the key list for a single status line
// (`showKeys`/`showStatus`/`status`/`statusClass`); the TUI presentation
// keeps the single-line key list and swaps it for the status when there is one.
//
// Environment: `rows(data)` returning the keyed row list, `listClass` (web
// root class), `errorClass` (web), and the TUI colors plus the
// error/warning/tip foreground/background pairs for the status badge.

import { unwrap } from "select/state/cells"
import { commandWidth } from "./CommandItem.js"

// Constant: ELLIPSIS
// The trailing marker shown when the bar cannot fit every entry.
const ELLIPSIS = { id: null, title: "…", dim: true }

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
// Count of marked entries in the focused listing, for the status bar's right
// zone. `focusedMarked` carries the parent/preview mirror too; the older
// active-pane fallback keeps hosts that do not thread it working.
function commandBarMarks(data) {
	const focused = unwrap(data?.focusedMarked)
	if (focused !== undefined && focused !== null) {
		const count = focused.size ?? 0
		return count > 0 ? `${count} marked` : ""
	}
	const active = unwrap(data?.active)
	const marked = active === "left" ? unwrap(data?.leftMarked) : unwrap(data?.rightMarked)
	const count = marked?.size ?? 0
	return count > 0 ? `${count} marked` : ""
}

// Function: commandBarMarksItem
// The marked count as a trailing, non-clickable bar entry (null when none).
// It belongs to listing contexts only: a file card in the maximized preview or
// the fullscreen viewer has no listing to mark.
function commandBarMarksItem(data) {
	const directory = Boolean(unwrap(data?.previewDirectory))
	if (!directory && (unwrap(data?.viewerOpen) || unwrap(data?.previewFull))) return null
	const marks = commandBarMarks(data)
	return marks ? { id: null, title: marks, dim: true } : null
}

// Function: commandBarFit
// Truncates entries to `width` columns, appending a dim ellipsis when an entry
// had to be dropped. `width <= 0` (not measured yet) keeps every entry and
// lets the renderer clip. The bar is always one line: entries never wrap.
function commandBarFit(items, width) {
	const list = items ?? []
	if (!width || width <= 0) return list
	let used = 0
	for (let i = 0; i < list.length; i++) {
		const next = used + commandWidth(list[i])
		if (next > width) {
			const kept = list.slice(0, i)
			// The ellipsis needs its own column plus the separating space.
			while (kept.length && used + 2 > width) used -= commandWidth(kept.pop())
			return [...kept, ELLIPSIS]
		}
		used = next
	}
	return list
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
		showBar: (_self, data) => !unwrap(data?.desktopMode) || Boolean(commandBarStatus(data)),
		showKeys: (_self, data) => !unwrap(data?.desktopMode) && !commandBarStatus(data),
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
		behaviors.rows = (self, data) => env.rows(self, data)
	}
	return behaviors
}

export { commandBarFit, commandBarMarks, commandBarMarksItem, commandBarStatus, createBehaviors }

// EOF
