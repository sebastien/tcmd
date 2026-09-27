// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tests/helpers/mock-fs
// In-memory filesystem adapter for core tests. Mirrors the adapter interface
// in src/js/tcmd/core/fs.js, including the mutating operations (copy, move,
// trash, erase, touch, du) so operations can be tested without touching the
// real disk.

import { basename, extname, join, parent } from "../../src/js/tcmd/core/path.js"

// Function: createMockFs
// Builds a mutable adapter over a `{ path -> entries }` map where each entry
// is `{ name, isDir, size?, mtimeMs?, text? }`.
function createMockFs(tree) {
	const dirs = new Map()
	for (const [path, entries] of Object.entries(tree)) {
		dirs.set(normalize(path), entries.map(cloneEntry))
	}
	const trashed = []

	function normalize(path) {
		return path.replace(/\/+$/, "") || "/"
	}

	function findEntry(path) {
		const dir = dirs.get(parent(path) ?? "/")
		return dir?.find((entry) => entry.name === basename(path))
	}

	function upsert(path, entry) {
		const parentDir = dirs.get(parent(path) ?? "/")
		if (!parentDir) throw new Error(`ENOENT: ${parent(path)}`)
		const index = parentDir.findIndex((candidate) => candidate.name === entry.name)
		if (index >= 0) parentDir[index] = entry
		else parentDir.push(entry)
	}

	async function stat(path) {
		const normalized = normalize(path)
		if (dirs.has(normalized)) {
			return { isDir: true, isSymlink: false, size: 0, mtimeMs: 0 }
		}
		const entry = findEntry(normalized)
		if (!entry) return null
		return {
			isDir: false,
			isSymlink: Boolean(entry.isSymlink),
			size: entry.size ?? entry.text?.length ?? 0,
			mtimeMs: entry.mtimeMs ?? 0,
		}
	}

	async function eraseOne(path) {
		const normalized = normalize(path)
		const parentDir = dirs.get(parent(normalized) ?? "/")
		if (parentDir) {
			const index = parentDir.findIndex((entry) => entry.name === basename(normalized))
			if (index >= 0) parentDir.splice(index, 1)
		}
		if (dirs.has(normalized)) {
			dirs.delete(normalized)
			const prefix = normalized === "/" ? "/" : `${normalized}/`
			for (const key of [...dirs.keys()]) {
				if (key.startsWith(prefix)) dirs.delete(key)
			}
		}
	}

	async function copy(from, to) {
		const source = normalize(from)
		const target = normalize(to)
		if (dirs.has(source)) {
			dirs.set(target, dirs.get(source).map(cloneEntry))
			upsert(target, { name: basename(target), isDir: true })
			return
		}
		const entry = findEntry(source)
		if (!entry) throw new Error(`ENOENT: ${from}`)
		upsert(target, { ...cloneEntry(entry), name: basename(target) })
	}

	async function du(path) {
		const normalized = normalize(path)
		if (dirs.has(normalized)) {
			let total = 0
			for (const entry of dirs.get(normalized)) {
				total += await du(join(normalized, entry.name))
			}
			return total
		}
		const stats = await stat(normalized)
		return stats?.size ?? 0
	}

	return {
		readDir: async (path) => {
			const entries = dirs.get(normalize(path))
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
				ext: entry.isDir ? null : extname(entry.name),
			}))
		},
		stat,
		isDir: async (path) => dirs.has(normalize(path)),
		readTextHead: async (path, maxBytes = 65536) => {
			const entry = findEntry(normalize(path))
			if (!entry || entry.isDir) throw new Error(`ENOENT: ${path}`)
			return (entry.text ?? "").slice(0, maxBytes)
		},
		du,
		disk: async () => ({ free: 1_000_000, total: 4_000_000 }),
		copy,
		move: async (from, to) => {
			await copy(from, to)
			await eraseOne(from)
		},
		trash: async (paths) => {
			for (const path of paths) {
				trashed.push(normalize(path))
				await eraseOne(path)
			}
		},
		erase: async (paths) => {
			for (const path of paths) await eraseOne(path)
		},
		touch: async (path) => {
			const normalized = normalize(path)
			const entry = findEntry(normalized)
			if (entry) entry.mtimeMs = Date.now()
			else upsert(normalized, { name: basename(normalized), isDir: false, size: 0, mtimeMs: Date.now(), text: "" })
		},
		trashed,
		home: () => "/home/tester",
		cwd: () => "/home/tester",
	}
}

function cloneEntry(entry) {
	return { ...entry }
}

export { createMockFs }

// EOF
