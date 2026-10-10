// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-09

// Module: tcmd/components/PaneLabel
// PaneLabel: the pane's role tag in its header row — SRC for the source pane
// (left), DST for the destination pane (right). The active pane's label is
// accented; the inactive one is dim, so focus is visible from the header too.
//
// Environment: `accentFg` (active), `textSecondaryFg` (inactive),
// `activeClass` (web), `paneId`.

import { PANE_LABELS } from "../core/pane.js"
import { unwrap } from "select/state/cells"

// Function: paneLabel
// "SRC" / "DST" for a pane id (see core/pane for the pane identity maps),
// followed by an explicit space so the label never touches the path that
// follows it in the header row.
function paneLabel(paneId) {
	return `${PANE_LABELS[`${paneId ?? ""}`] ?? `${paneId ?? ""}`.toUpperCase()} `
}

// Function: createBehaviors
// Builds the PaneLabel behavior map for the given renderer environment.
function createBehaviors(env) {
	const isActive = (data) => unwrap(data.active) === unwrap(data.paneId)
	return {
		label: (_self, data) => paneLabel(data.paneId),
		labelClass: (_self, data) => (isActive(data) ? env?.activeClass : null),
		labelFg: (_self, data) => (isActive(data) ? env?.accentFg : env?.textSecondaryFg),
	}
}

export { createBehaviors, paneLabel }
