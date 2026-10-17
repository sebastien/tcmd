// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/path
// Pure string path operations. No filesystem or platform imports, so the same
// helpers can back the TUI now and a web UI later.

const SEP = "/"

function normalize(p) {
	return `${p ?? ""}`.replace(/\/+/g, SEP).replace(/(.)\/$/, "$1") || SEP
}

function join(base, name) {
	if (name === undefined || name === null || name === "") return normalize(base)
	if (name.startsWith(SEP)) return normalize(name)
	return normalize(`${normalize(base)}${SEP}${name}`)
}

function basename(p) {
	const parts = split(p)
	return parts.length ? parts[parts.length - 1] : SEP
}

function parent(p) {
	const parts = split(p)
	if (parts.length === 0) return null
	if (parts.length === 1) return SEP
	return SEP + parts.slice(0, parts.length - 1).join(SEP)
}

function split(p) {
	return normalize(p).split(SEP).filter((part) => part.length > 0)
}

// Function: extname
// Lowercased extension of the last segment, without the dot; null when the
// name has no extension (or is a dotfile). A bare filename (no separator), the
// common case when building a listing, skips the `basename` split.
function extname(p) {
	const text = `${p ?? ""}`
	const name = text.indexOf(SEP) < 0 ? text : basename(text)
	const at = name.lastIndexOf(".")
	return at > 0 ? name.slice(at + 1).toLowerCase() : null
}

// Function: prefix
// Returns the path of the first `count` non-root segments of `p`, so
// `prefix("/a/b/c", 2)` is `"/a/b"`; count 0 is the root itself.
function prefix(p, count) {
	const parts = split(p)
	return SEP + parts.slice(0, Math.max(0, count)).join(SEP)
}

export { SEP, basename, extname, join, normalize, parent, prefix, split }

// EOF
