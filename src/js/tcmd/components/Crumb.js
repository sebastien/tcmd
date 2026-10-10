// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/components/Crumb
// A single breadcrumb segment: its name, then a "/" separator (dimmed, and
// omitted after the basename, which closes the path). Behaviors read
// `{ item: segment, last, paneId }`, the same bag shape in both engines
// (built by `Component.map`). The root segment renders as "/" alone.
//
// Environment: `textSecondaryFg`, `textHeadingFg`, `rootClass`, `childClass`.

// Function: isRoot
function isRoot(segment) {
	return segment?.path === "/"
}

// Function: crumbLabel
// The segment's display name: "/" for the root, the (possibly elided) name
// otherwise, and "…" for the truncation marker (no path).
function crumbLabel(segment) {
	if (!segment) return ""
	return isRoot(segment) ? "/" : `${segment.name}`
}

// Function: crumbSep
// The "/" drawn after a segment — every one but the last (the basename).
function crumbSep(segment, last) {
	return last || isRoot(segment) ? "" : "/"
}

// Function: createBehaviors
// Builds the Crumb behavior map for the given renderer environment.
function createBehaviors(env) {
	const dim = (_self, data) => isRoot(data.item) || !data.item?.path
	return {
		crumbClass: (_self, data) => (isRoot(data.item) ? env.rootClass : env.childClass),
		crumbLabel: (_self, data) => crumbLabel(data.item),
		crumbSep: (_self, data) => crumbSep(data.item, data.last),
		crumbSepFg: () => env.textSecondaryFg,
		crumbFg: (_self, data) => (dim(_self, data) ? env.textSecondaryFg : env.textHeadingFg),
	}
}

export { crumbLabel, crumbSep, createBehaviors, isRoot }

// EOF
