// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/components/TabItem
// One tab in a pane's tab bar. Behaviors read `{ item: tab, index, active,
// paneId }`, the same bag shape in both engines. `active` is a reactive cell,
// read with `unwrap` at the point of use.
//
// Environment: `accentFg`, `dimFg`, `activeClass` (web).

import { unwrap } from "select/state/cells"

// Function: tabLabel
// The tab's fileset label, e.g. "A".
function tabLabel(tab) {
	if (!tab) return ""
	return `${tab.label} `
}

// Function: isActive
function isActive(index, active) {
	return index === unwrap(active)
}

// Function: createBehaviors
// Builds the TabItem behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		tabClass: (_self, data) => (isActive(data.index, data.active) ? env?.activeClass : null),
		tabFg: (_self, data) => (isActive(data.index, data.active) ? env?.accentFg : env?.dimFg),
		tabLabel: (_self, data) => tabLabel(data.item),
	}
}

export { createBehaviors, isActive, tabLabel }

// EOF
