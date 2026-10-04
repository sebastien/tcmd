// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/Confirm
// Confirm: a small y/n overlay for destructive operations (erase, overwrite).
// Reads the session's `confirm` cell (`{ text } | null`) and shows the
// pending question; App routes y/enter to `confirm.yes` and n/esc to
// `confirm.no`.
//
// Environment: `overlayBg` (surface), `errorFg` (border), `textHeadingFg`
// (text), `textSecondaryFg` (key hints).

import { unwrap } from "select/state/cells"

// Function: createBehaviors
// Builds the Confirm behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		bg: () => env.overlayBg,
		borderFg: () => env.errorFg,
		keysFg: () => env.textSecondaryFg,
		text: (_self, data) => {
			const pending = unwrap(data.confirm)
			if (!pending) return ""
			return `${pending.text ?? ""}  [y]es [n]o`
		},
		textFg: () => env.textHeadingFg,
		visible: (_self, data) => Boolean(unwrap(data.confirm)),
	}
}

export { createBehaviors }

// EOF
