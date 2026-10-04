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
// `/.trash` directory at the storage root, where they stay browsable.

import { basename, extname, join, normalize, parent, split } from "../core/path.js"

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
	async function readTextHead(path, maxBytes = 65536) {
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
	// user copies "into" a directory).
	async function copy(from, to) {
		const stats = await stat(from)
		if (!stats) throw notFound(from)
		if (stats.isDir) {
			if (!(await stat(to))?.isDir) await ensureDir(to)
			for await (const handle of (await resolveDir(from)).values()) {
				await copy(join(from, handle.name), join(to, handle.name))
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

	// Function: eraseOne
	// Removes one entry (recursively for directories); the root is a no-op.
	async function eraseOne(path) {
		const normalized = normalize(path)
		if (normalized === "/") return
		const directory = await resolveDir(parent(normalized) ?? "/")
		await directory.removeEntry(basename(normalized), { recursive: true })
	}

	// Function: trash
	// Moves entries into `/.trash` under a timestamped name, keeping them
	// available for inspection instead of deleting them.
	let trashSeq = 0
	async function trash(paths) {
		await ensureDir("/.trash")
		for (const path of paths) {
			const normalized = normalize(path)
			if (normalized === "/") continue
			const name = `${Date.now()}-${++trashSeq}-${basename(normalized)}`
			await copy(normalized, join("/.trash", name))
			await eraseOne(normalized)
		}
	}

	// Function: touch
	// Creates an empty file, or rewrites an existing one to bump its mtime
	// (OPFS exposes no utimes).
	async function touch(path) {
		const normalized = normalize(path)
		const stats = await stat(normalized)
		if (stats?.isDir) return
		const directory = await resolveDir(parent(normalized) ?? "/")
		const handle = await directory.getFileHandle(basename(normalized), { create: true })
		if (!stats) return
		const bytes = await (await handle.getFile()).arrayBuffer()
		const writable = await handle.createWritable()
		await writable.write(bytes)
		await writable.close()
	}

	// Function: writeText
	// Creates (or replaces) a UTF-8 text file, creating parent directories.
	async function writeText(path, text) {
		const normalized = normalize(path)
		const directory = await resolveDir(parent(normalized) ?? "/", { create: true })
		const handle = await directory.getFileHandle(basename(normalized), { create: true })
		const writable = await handle.createWritable()
		await writable.write(`${text}`)
		await writable.close()
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
			await copy(from, to)
			await eraseOne(from)
		},
		trash,
		erase: async (paths) => {
			for (const path of paths) await eraseOne(path)
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

export { createOpfsFs }

// EOF
