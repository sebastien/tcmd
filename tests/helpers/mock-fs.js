// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tests/helpers/mock-fs
// In-memory filesystem adapter for core tests. Mirrors the adapter interface
// in src/js/tcmd/core/fs.js, including the mutating operations (copy, move,
// trash, erase, touch, du) so operations can be tested without touching the
// real disk.

import { basename, extname, join, parent, split } from "../../src/js/tcmd/core/path.js"
import { PREVIEW_BYTES } from "../../src/js/tcmd/core/preview.js"

// Function: createMockFs
// Builds a mutable adapter over a `{ path -> entries }` map where each entry
// is `{ name, isDir, size?, mtimeMs?, text?, isSymlink?, target? }`. A
// `target` marks the entry as a symlink: listings, stats, `isDir` and
// `readTextHead` all resolve through it, like the Node adapter does.
function createMockFs(tree) {
	const dirs = new Map()
	for (const [path, entries] of Object.entries(tree)) {
		dirs.set(normalize(path), entries.map(cloneEntry))
	}
	const trashed = []
	// Trashed entries, so `trashList`/`restore` can browse and undelete them
	// (the mock keeps the copy under `/.trash`, like the OPFS adapter).
	const trashEntries = []

	function normalize(path) {
		return path.replace(/\/+$/, "") || "/"
	}

	function findEntry(path) {
		const dir = dirs.get(parent(path) ?? "/")
		return dir?.find((entry) => entry.name === basename(path))
	}

	// Function: resolveAgainst
	// Resolves `..`/`.` segments of `target` against `baseDir`. `core/path`
	// normalizes slashes only (it is a string helper), and the mock has to
	// actually find where a relative link points.
	function resolveAgainst(baseDir, target) {
		const parts = target.startsWith("/") ? [] : split(baseDir)
		for (const part of split(target)) {
			if (part === ".") continue
			if (part === "..") parts.pop()
			else parts.push(part)
		}
		return parts.length ? `/${parts.join("/")}` : "/"
	}

	// Function: resolveLink
	// Follows one listing entry through symlink hops the way the Node
	// adapter's `stat`/`readdir` do: a link to a directory resolves to a
	// directory, a link to a file to that file's size and text, a broken link
	// to `broken` (the Node adapter's `stat` returns null for one). Hops are
	// capped so a loop cannot hang the mock.
	function resolveLink(entry, dirPath, depth = 0) {
		if (entry?.isDir) return { isDir: true, size: 0, text: null, broken: false }
		if (!entry?.isSymlink || !entry.target || depth >= 8) {
			return {
				isDir: false,
				size: entry?.size ?? entry?.text?.length ?? 0,
				text: entry?.text ?? null,
				broken: false,
			}
		}
		const target = resolveAgainst(dirPath, entry.target)
		if (dirs.has(target)) return { isDir: true, size: 0, text: null, broken: false }
		const next = (dirs.get(parent(target) ?? "/") ?? []).find(
			(candidate) => candidate.name === basename(target),
		)
		if (!next) return { isDir: false, size: 0, text: null, broken: true }
		return resolveLink(next, parent(target) ?? "/", depth + 1)
	}

	// Function: dirKeyOf
	// The `dirs` key a path reads, following symlink hops: `readDir` on a link
	// to a directory reads the target's contents (with the link path as the
	// base, what `readdir` does). Null when the path is not a readable
	// directory.
	function dirKeyOf(path, depth = 0) {
		const normalized = normalize(path)
		if (dirs.has(normalized)) return normalized
		const entry = findEntry(normalized)
		if (!entry?.isSymlink || !entry.target || depth >= 8) return null
		const target = resolveAgainst(parent(normalized) ?? "/", entry.target)
		return dirKeyOf(target, depth + 1)
	}

	function upsert(path, entry) {
		const parentDir = dirs.get(parent(path) ?? "/")
		if (!parentDir) throw new Error(`ENOENT: ${parent(path)}`)
		const index = parentDir.findIndex((candidate) => candidate.name === entry.name)
		if (index >= 0) parentDir[index] = entry
		else parentDir.push(entry)
	}

	function hasPath(path) {
		const normalized = normalize(path)
		return dirs.has(normalized) || Boolean(findEntry(normalized))
	}

	async function assertCopySafe(from, to) {
		const source = normalize(from)
		const target = normalize(to)
		const sourceIsDir = dirs.has(source)
		if (!sourceIsDir && !findEntry(source)) {
			const error = new Error(`ENOENT: ${from}`)
			error.code = "ENOENT"
			throw error
		}
		if (source === target || (sourceIsDir && target.startsWith(source === "/" ? "/" : `${source}/`))) {
			throw new Error(`cannot copy a path into itself: ${to}`)
		}
		if (!hasPath(target)) return
		if (!sourceIsDir || !dirs.has(target)) {
			const error = new Error(`destination already exists: ${to}`)
			error.code = "EEXIST"
			throw error
		}
		for (const entry of dirs.get(source)) await assertCopySafe(join(source, entry.name), join(target, entry.name))
	}

	async function stat(path) {
		const normalized = normalize(path)
		if (dirs.has(normalized)) {
			return {
				isDir: true,
				isSymlink: false,
				isDevice: false,
				size: 0,
				mtimeMs: 0,
				ctimeMs: 0,
				mode: 0o040755,
				uid: null,
				gid: null,
				owner: "",
			}
		}
		const entry = findEntry(normalized)
		if (!entry) return null
		// Symlinks stat through to their target, like `fs.stat` does — and a
		// broken one has no stat at all.
		const resolved = resolveLink(entry, parent(normalized) ?? "/")
		if (resolved.broken) return null
		return {
			isDir: resolved.isDir,
			isSymlink: Boolean(entry.isSymlink),
			isDevice: Boolean(entry.isDevice),
			size: resolved.isDir ? 0 : resolved.size,
			mtimeMs: entry.mtimeMs ?? 0,
			ctimeMs: entry.ctimeMs ?? 0,
			mode: resolved.isDir ? 0o040755 : entry.mode ?? 0o100644,
			uid: entry.uid ?? null,
			gid: entry.gid ?? null,
			owner: entry.owner ?? "",
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
		await assertCopySafe(source, target)
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

	// Function: mkdirp
	// Creates `path` and any missing parents as empty directories.
	async function mkdirp(path) {
		const normalized = normalize(path)
		if (normalized === "/" || dirs.has(normalized)) return
		await mkdirp(parent(normalized) ?? "/")
		dirs.set(normalized, [])
		upsert(normalized, { name: basename(normalized), isDir: true })
	}

	return {
		readDir: async (path) => {
			const key = dirKeyOf(path)
			const entries = key === null ? null : dirs.get(key)
			if (!entries) {
				const error = new Error(`ENOENT: ${path}`)
				error.code = "ENOENT"
				throw error
			}
			return entries.map((entry) => {
				// A symlink lists as what it points at (see `resolveLink`).
				const resolved = resolveLink(entry, normalize(path))
				return {
					name: entry.name,
					path: join(path, entry.name),
					isDir: resolved.isDir,
					isSymlink: Boolean(entry.isSymlink),
					// The raw target text, relative as written; null unless
					// the entry is a link.
					target: entry.isSymlink ? entry.target ?? null : null,
					isDevice: Boolean(entry.isDevice),
					size: resolved.isDir ? 0 : resolved.size,
					mtimeMs: entry.mtimeMs ?? 0,
					ctimeMs: entry.ctimeMs ?? 0,
					mode: resolved.isDir ? 0o040755 : entry.mode ?? 0o100644,
					uid: entry.uid ?? null,
					gid: entry.gid ?? null,
					owner: entry.owner ?? "",
					ext: resolved.isDir ? null : extname(entry.name),
				}
			})
		},
		stat,
		isDir: async (path) => (await stat(path))?.isDir === true,
		readTextHead: async (path, maxBytes = PREVIEW_BYTES) => {
			const normalized = normalize(path)
			const entry = findEntry(normalized)
			if (!entry) throw new Error(`ENOENT: ${path}`)
			// Reads follow the link, like `fs.open` does.
			const resolved = resolveLink(entry, parent(normalized) ?? "/")
			if (resolved.isDir) throw new Error(`EISDIR: ${path}`)
			if (resolved.broken) throw new Error(`ENOENT: ${path}`)
			return (resolved.text ?? "").slice(0, maxBytes)
		},
		du,
		disk: async () => ({ free: 1_000_000, total: 4_000_000 }),
		copy,
		move: async (from, to) => {
			if (hasPath(to)) {
				const error = new Error(`destination already exists: ${to}`)
				error.code = "EEXIST"
				throw error
			}
			await copy(from, to)
			await eraseOne(from)
		},
		mkdir: mkdirp,
		trash: async (paths) => {
			await mkdirp("/.trash")
			const out = []
			for (const path of paths) {
				const normalized = normalize(path)
				if (normalized === "/") continue
				const name = `${trashEntries.length + 1}-${basename(normalized)}`
				const to = `/.trash/${name}`
				await copy(normalized, to)
				await eraseOne(normalized)
				trashEntries.push({ name, from: normalized, to, deletedAt: null })
				trashed.push(normalized)
				out.push({ from: normalized, to, name })
			}
			return out
		},
		trashList: async () =>
			trashEntries.map((entry) => ({
				name: entry.name,
				originalPath: entry.from,
				deletedAt: entry.deletedAt,
				trashPath: entry.to,
				isDir: dirs.has(entry.to),
			})),
		restore: async (trashPaths) => {
			for (const to of trashPaths) {
				const normalized = normalize(to)
				const entry = trashEntries.find((candidate) => candidate.to === normalized)
				if (!entry) throw new Error(`unknown trash entry: ${to}`)
				if (hasPath(entry.from)) {
					const error = new Error(`destination already exists: ${entry.from}`)
					error.code = "EEXIST"
					throw error
				}
				await mkdirp(parent(entry.from) ?? "/")
				await copy(normalized, entry.from)
				await eraseOne(normalized)
				const index = trashEntries.indexOf(entry)
				if (index >= 0) trashEntries.splice(index, 1)
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
