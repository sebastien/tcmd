// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tests/helpers/mock-fs
// In-memory filesystem adapter for core tests. Mirrors the adapter interface
// in src/js/tcmd/core/fs.js.

import { join } from "../../src/js/tcmd/core/path.js"

// Function: createMockFs
// Builds an adapter over a `{ path -> entries }` map where each entry is
// `{ name, isDir, size?, mtimeMs?, text? }`.
function createMockFs(tree) {
	const dirs = new Map()
	for (const [path, entries] of Object.entries(tree)) {
		dirs.set(path.replace(/\/+$/, "") || "/", entries)
	}
	async function readDir(path) {
		const entries = dirs.get(path.replace(/\/+$/, "") || "/")
		if (!entries) {
			const error = new Error(`ENOENT: ${path}`)
			error.code = "ENOENT"
			throw error
		}
		return entries.map((entry) => ({
			name: entry.name,
			path: join(path, entry.name),
			isDir: Boolean(entry.isDir),
			isSymlink: Boolean(entry.isSymlink),
			size: entry.isDir ? 0 : entry.size ?? entry.text?.length ?? 0,
			mtimeMs: entry.mtimeMs ?? 0,
			ext: entry.isDir ? null : extensionOf(entry.name),
		}))
	}
	return {
		readDir,
		async stat(path) {
			const dir = dirs.get(path.replace(/\/+$/, "") || "/")
			return dir ? { isDirectory: true, size: 0, mtimeMs: 0 } : null
		},
		async isDir(path) {
			return dirs.has(path.replace(/\/+$/, "") || "/")
		},
		async readTextHead(path, maxBytes = 65536) {
			const dir = path.slice(0, path.lastIndexOf("/")) || "/"
			const name = path.slice(path.lastIndexOf("/") + 1)
			const entry = (dirs.get(dir) || []).find((entry) => entry.name === name)
			if (!entry || entry.isDir) throw new Error(`ENOENT: ${path}`)
			return (entry.text ?? "").slice(0, maxBytes)
		},
		async disk() {
			return { free: 1_000_000, total: 4_000_000 }
		},
		home: () => "/home/tester",
		cwd: () => "/home/tester",
	}
}

function extensionOf(name) {
	const at = name.lastIndexOf(".")
	return at > 0 ? name.slice(at + 1).toLowerCase() : null
}

export { createMockFs }

// EOF
