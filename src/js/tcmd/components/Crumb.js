// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Crumb
// A single breadcrumb segment. Behaviors read `{ item: segment, paneId }`, the
// same bag shape in both engines (built by `Component.map`).
//
// Environment: `dimFg`, `titleFg`, `rootClass`, `childClass`.

// Function: crumbLabel
// Root crumb renders as "[/]"; the rest as "name /".
function crumbLabel(segment) {
	if (!segment) return ""
	return segment.path === "/" ? "[/] " : `${segment.name} / `
}

// Function: isRoot
function isRoot(segment) {
	return segment?.path === "/"
}

// Function: createBehaviors
// Builds the Crumb behavior map for the given renderer environment.
function createBehaviors(env) {
	return {
		crumbClass: (_self, data) => (isRoot(data.item) ? env.rootClass : env.childClass),
		crumbLabel: (_self, data) => crumbLabel(data.item),
		crumbFg: (_self, data) => (isRoot(data.item) ? env.dimFg : env.titleFg),
	}
}

export { crumbLabel, createBehaviors, isRoot }
