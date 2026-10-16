// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/opfs
// Origin Private File System adapter for `core/fs`. Implements the adapter
// interface documented in `core/fs.js` on top of OPFS directory/file handles,
// mapping POSIX-style tcmd paths ("/home/tester") onto the storage root.
// Requires a secure context (https or localhost); the root handle is resolved
// lazily, so importing this module has no browser dependency and tests can
// inject a fake `root`.
//
// Beyond the core interface, `writeText` (create/replace a UTF-8 file,
// creating parents) backs the demo seeding in `web/main.js`.
//
// Trash: OPFS has no system trash, so `trash(paths)` moves entries into a
// `/.trash` directory at the storage root, recording original paths in
// `/.trash/index.json` so `trashList()`/`restore()` can browse and undelete
// them across reloads.

import { basename, extname, join, normalize, parent, split } from "../core/path.js"
import { PREVIEW_BYTES } from "../core/preview.js"

// Function: createOpfsFs
// Builds the filesystem adapter. `root` overrides the OPFS root handle (tests);
// `home` is the directory `home()`/`cwd()` report.
function createOpfsFs({ root, home = "/home/tester" } = {}) {
	let rootHandle = root ?? null

	// Function: getRoot
	// Resolves (once) and returns the OPFS root directory handle.
	async function getRoot() {
		if (rootHandle) return rootHandle
		const storage = globalThis.navigator?.storage
		if (!storage?.getDirectory) throw new Error("OPFS is not available in this browser")
		rootHandle = await storage.getDirectory()
		return rootHandle
	}

	// Function: resolveDir
	// Resolves `path` to a directory handle; when `create` is set, missing
	// directories along the way are created.
	async function resolveDir(path, { create = false } = {}) {
		let directory = await getRoot()
		for (const name of split(path)) {
			directory = await directory.getDirectoryHandle(name, { create })
		}
		return directory
	}

	// Function: resolveFile
	// Resolves `path` to a file handle, or null when it is missing or is a
	// directory.
	async function resolveFile(path) {
		const directory = await resolveDir(parent(path) ?? "/")
		try {
			return await directory.getFileHandle(basename(path))
		} catch (error) {
			if (error?.name === "NotFoundError" || error?.name === "TypeMismatchError") return null
			throw error
		}
	}

	// Function: ensureDir
	// Creates `path` (and its parents) and returns its directory handle.
	async function ensureDir(path) {
		const normalized = normalize(path)
		const directory = await resolveDir(parent(normalized) ?? "/", { create: true })
		return directory.getDirectoryHandle(basename(normalized), { create: true })
	}

	// Function: toEntry
	// Maps an OPFS handle to the core FileEntry shape.
	async function toEntry(dirPath, handle) {
		const path = join(dirPath, handle.name)
		if (handle.kind === "directory") {
			return {
				name: handle.name,
				path,
				isDir: true,
				isSymlink: false,
				isDevice: false,
				size: 0,
				mtimeMs: 0,
				ctimeMs: 0,
				mode: 0,
				uid: null,
				gid: null,
				owner: "",
				ext: null,
			}
		}
		const file = await handle.getFile()
		return {
			name: handle.name,
			path,
			isDir: false,
			isSymlink: false,
			isDevice: false,
			size: file.size,
			mtimeMs: file.lastModified,
			ctimeMs: 0,
			mode: 0,
			uid: null,
			gid: null,
			owner: "",
			ext: extname(handle.name),
		}
	}

	// Function: stat
	// Stat info for a file, a directory, or null when `path` does not exist.
	async function stat(path) {
		const normalized = normalize(path)
		const zero = { ctimeMs: 0, mode: 0, uid: null, gid: null, owner: "" }
		if (normalized === "/") return { isDir: true, isSymlink: false, isDevice: false, size: 0, mtimeMs: 0, ...zero }
		try {
			await resolveDir(normalized)
			return { isDir: true, isSymlink: false, isDevice: false, size: 0, mtimeMs: 0, ...zero }
		} catch (error) {
			// Not a directory (missing, or a file sits at this path).
		}
		try {
			const handle = await resolveFile(normalized)
			if (!handle) return null
			const file = await handle.getFile()
			return { isDir: false, isSymlink: false, isDevice: false, size: file.size, mtimeMs: file.lastModified, ...zero }
		} catch (error) {
			return null
		}
	}

	// Function: readDir
	// Lists `path` as FileEntry-like rows.
	async function readDir(path) {
		const directory = await resolveDir(normalize(path))
		const entries = []
		for await (const handle of directory.values()) entries.push(await toEntry(path, handle))
		return entries
	}

	// Function: readTextHead
	// Leading `maxBytes` of a text file, decoded as UTF-8.
	async function readTextHead(path, maxBytes = PREVIEW_BYTES) {
		const handle = await resolveFile(normalize(path))
		if (!handle) throw notFound(path)
		const file = await handle.getFile()
		return file.slice(0, maxBytes).text()
	}

	// Function: du
	// Recursive size in bytes; unreadable entries contribute 0.
	async function du(path) {
		const stats = await stat(path)
		if (!stats) return 0
		if (!stats.isDir) return stats.size
		let total = 0
		for (const entry of await readDir(path)) {
			total += entry.isDir ? await du(entry.path) : entry.size
		}
		return total
	}

	// Function: disk
	// Storage estimate as `{ free, total }`, or null when the browser does not
	// expose one.
	async function disk() {
		const storage = globalThis.navigator?.storage
		if (!storage?.estimate) return null
		try {
			const { usage = 0, quota = 0 } = await storage.estimate()
			return { free: Math.max(0, quota - usage), total: quota }
		} catch (error) {
			return null
		}
	}

	// Function: copy
	// Recursive copy of a file or directory; an existing directory target is
	// merged into (the operations layer already appends the basename when the
	// user copies "into" a directory), but colliding entries are never replaced.
	async function copy(from, to) {
		assertOutsideTrash(to)
		return withPathLock(to, () => copyEntry(from, to))
	}

	async function copyEntry(from, to) {
		await assertCopySafe(from, to)
		const stats = await stat(from)
		if (stats.isDir) {
			if (!(await stat(to))?.isDir) await ensureDir(to)
			for await (const handle of (await resolveDir(from)).values()) {
				await copyEntry(join(from, handle.name), join(to, handle.name))
			}
			return
		}
		const file = await (await resolveFile(from)).getFile()
		const directory = await resolveDir(parent(to) ?? "/")
		const handle = await directory.getFileHandle(basename(to), { create: true })
		const writable = await handle.createWritable()
		await writable.write(file)
		await writable.close()
	}

	async function assertCopySafe(from, to) {
		const sourcePath = normalize(from)
		const targetPath = normalize(to)
		const source = await stat(sourcePath)
		if (!source) throw notFound(from)
		if (
			sourcePath === targetPath ||
			(source.isDir && targetPath.startsWith(sourcePath === "/" ? "/" : `${sourcePath}/`))
		) {
			throw new Error(`cannot copy a path into itself: ${to}`)
		}
		const destination = await stat(targetPath)
		if (!destination) return
		if (!source.isDir || !destination.isDir) throw pathExistsError(to)
		for (const entry of await readDir(sourcePath)) {
			await assertCopySafe(entry.path, join(targetPath, entry.name))
		}
	}

	// Function: eraseOne
	// Removes one entry (recursively for directories); the root is a no-op.
	async function eraseOne(path) {
		const normalized = normalize(path)
		if (normalized === "/") return
		const directory = await resolveDir(parent(normalized) ?? "/")
		await directory.removeEntry(basename(normalized), { recursive: true })
	}

	// Function: mkdir
	// Creates `path` (and its parents) as a directory.
	async function mkdir(path) {
		const normalized = normalize(path)
		assertOutsideTrash(normalized)
		if (normalized === "/") return
		return withPathLock(normalized, () => ensureDir(normalized))
	}

	// Constant: TRASH_DIR / TRASH_INDEX
	// Trashed entries live under `/.trash/<name>` and the original paths are
	// recorded in `/.trash/index.json`, so a restore survives a reload.
	const TRASH_DIR = "/.trash"
	const TRASH_INDEX = `${TRASH_DIR}/index.json`

	// Function: readTrashIndex
	// The trash index rows, or [] when the index is missing.
	async function readTrashIndex() {
		try {
			const handle = await resolveFile(TRASH_INDEX)
			if (!handle) return []
			const parsed = JSON.parse(await (await handle.getFile()).text())
			if (!Array.isArray(parsed)) throw new Error("invalid OPFS trash index")
			return parsed
		} catch (error) {
			if (error?.code === "ENOENT" || error?.name === "NotFoundError") return []
			throw error
		}
	}

	async function writeTrashIndex(rows) {
		await writeTextFile(TRASH_INDEX, JSON.stringify(rows))
	}

	// Function: trash
	// Moves entries into `/.trash` under a timestamped name, recording each
	// original path in the index so it can be listed and restored.
	let trashSeq = 0
	let trashQueue = Promise.resolve()
	const pathQueues = new Map()
	function withPathLocks(paths, action) {
		const keys = [
			...new Set(
				paths.flatMap((path) => {
					const chain = []
					let current = normalize(path)
					while (current !== "/") {
						chain.push(current)
						current = parent(current) ?? "/"
					}
					if (!chain.length) chain.push("/")
					return chain
				}),
			),
		].sort()
		const locks = globalThis.navigator?.locks
		const run = (index) => {
			if (index === keys.length) return action()
			const key = keys[index]
			if (locks?.request) return locks.request(`tcmd-opfs-path:${key}`, { mode: "exclusive" }, () => run(index + 1))
			const previous = pathQueues.get(key) ?? Promise.resolve()
			let release
			const gate = new Promise((resolve) => (release = resolve))
			const tail = previous.then(() => gate)
			pathQueues.set(key, tail)
			return previous.then(() => run(index + 1)).finally(() => {
				release()
				if (pathQueues.get(key) === tail) pathQueues.delete(key)
			})
		}
		return run(0)
	}
	const withPathLock = (path, action) => withPathLocks([path], action)

	function withTrashLock(action) {
		const locks = globalThis.navigator?.locks
		if (locks?.request) return locks.request("tcmd-opfs-trash-index", { mode: "exclusive" }, action)
		// ponytail: fallback serialization is adapter-local; Web Locks handles tabs where available.
		const pending = trashQueue.then(action, action)
		trashQueue = pending.catch(() => {})
		return pending
	}

	async function trash(paths) {
		return withTrashLock(async () => {
			await ensureDir(TRASH_DIR)
			const index = await readTrashIndex()
			const trashed = []
			for (const path of paths) {
				const normalized = normalize(path)
				if (normalized === "/") continue
				assertOutsideTrash(normalized)
				await withPathLocks([normalized, TRASH_DIR], async () => {
					let name
					let to
					do {
						name = `${Date.now()}-${++trashSeq}-${basename(normalized)}`
						to = join(TRASH_DIR, name)
					} while (await stat(to))
					await copyEntry(normalized, to)
					const row = { name, originalPath: normalized, deletedAt: new Date().toISOString() }
					index.push(row)
					try {
						await writeTrashIndex(index)
					} catch (error) {
						index.pop()
						await eraseOne(to)
						throw error
					}
					trashed.push({ from: normalized, to, name })
					// Persist the restore record before removing the source. If removing
					// it fails, both copies remain discoverable rather than losing the
					// only restore metadata.
					await eraseOne(normalized)
				})
			}
			return trashed
		})
	}

	// Function: trashList
	// The trash rows, newest first. Entries whose copy is gone are skipped.
	async function trashList() {
		const index = await readTrashIndex()
		const rows = []
		for (const row of index) {
			const trashPath = join(TRASH_DIR, row.name)
			const stats = await stat(trashPath)
			if (!stats) continue
			rows.push({
				name: row.name,
				originalPath: row.originalPath ?? null,
				deletedAt: row.deletedAt ?? null,
				trashPath,
				isDir: Boolean(stats.isDir),
			})
		}
		return rows.sort((a, b) => `${b.deletedAt ?? ""}`.localeCompare(`${a.deletedAt ?? ""}`))
	}

	// Function: restore
	// Moves trashed entries back to their recorded original paths.
	async function restore(trashPaths) {
		return withTrashLock(async () => {
			const wanted = new Set((trashPaths ?? []).map((path) => normalize(path)))
			const index = await readTrashIndex()
			const rows = index.filter((row) => wanted.has(normalize(join(TRASH_DIR, row.name))) && row.originalPath)
			if (rows.length !== wanted.size) throw new Error("unknown trash entry")
			const destinations = rows.map((row) => normalize(row.originalPath))
			if (new Set(destinations).size !== destinations.length) throw pathExistsError(destinations[0])
			for (const destination of destinations) assertOutsideTrash(destination)
			assertNoNestedDestinations(destinations)
			for (const row of rows) {
				if (await stat(row.originalPath)) throw pathExistsError(row.originalPath)
			}
			let remaining = index.slice()
			for (const row of rows) {
				const trashPath = join(TRASH_DIR, row.name)
				await withPathLocks([trashPath, row.originalPath], async () => {
					await ensureDir(parent(row.originalPath) ?? "/")
					if (await stat(row.originalPath)) throw pathExistsError(row.originalPath)
					await copyEntry(trashPath, row.originalPath)
					remaining = remaining.filter((candidate) => candidate !== row)
					await writeTrashIndex(remaining)
					await eraseOne(trashPath)
				})
			}
		})
	}

	// Function: touch
	// Creates an empty file, or rewrites an existing one to bump its mtime
	// (OPFS exposes no utimes).
	async function touch(path) {
		const normalized = normalize(path)
		assertOutsideTrash(normalized)
		return withPathLock(normalized, async () => {
			const stats = await stat(normalized)
			if (stats?.isDir) return
			const directory = await resolveDir(parent(normalized) ?? "/")
			const handle = await directory.getFileHandle(basename(normalized), { create: true })
			if (!stats) return
			const bytes = await (await handle.getFile()).arrayBuffer()
			const writable = await handle.createWritable()
			await writable.write(bytes)
			await writable.close()
		})
	}

	// Function: writeText
	// Creates (or replaces) a UTF-8 text file, creating parent directories.
	async function writeText(path, text) {
		const normalized = normalize(path)
		assertOutsideTrash(normalized)
		return withPathLock(normalized, () => writeTextFile(normalized, text))
	}

	async function writeTextFile(normalized, text) {
		const directory = await resolveDir(parent(normalized) ?? "/", { create: true })
		const handle = await directory.getFileHandle(basename(normalized), { create: true })
		const writable = await handle.createWritable()
		await writable.write(`${text}`)
		await writable.close()
	}

	function assertOutsideTrash(path) {
		const normalized = normalize(path)
		if (normalized === TRASH_DIR || normalized.startsWith(`${TRASH_DIR}/`)) {
			const error = new Error(`reserved OPFS trash path: ${normalized}`)
			error.code = "EPERM"
			throw error
		}
	}

	return {
		readDir,
		stat,
		isDir: async (path) => Boolean((await stat(path))?.isDir),
		readTextHead,
		du,
		disk,
		copy,
		move: async (from, to) => {
			assertOutsideTrash(from)
			assertOutsideTrash(to)
			return withPathLocks([from, to], async () => {
				if (await stat(to)) throw pathExistsError(to)
				await copyEntry(from, to)
				await eraseOne(from)
			})
		},
		mkdir,
		trash,
		trashList,
		restore,
		erase: async (paths) => {
			for (const path of paths) {
				assertOutsideTrash(path)
				await withPathLock(path, () => eraseOne(path))
			}
		},
		touch,
		writeText,
		home: () => home,
		cwd: () => home,
	}
}

// Function: notFound
// ENOENT-flavoured error for missing paths.
function notFound(path) {
	const error = new Error(`ENOENT: ${path}`)
	error.code = "ENOENT"
	return error
}

function pathExistsError(path) {
	const error = new Error(`destination already exists: ${path}`)
	error.code = "EEXIST"
	return error
}

function assertNoNestedDestinations(paths) {
	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			if (paths[j].startsWith(`${paths[i]}/`) || paths[i].startsWith(`${paths[j]}/`)) {
				throw pathExistsError(paths[j])
			}
		}
	}
}

export { createOpfsFs }

// EOF
