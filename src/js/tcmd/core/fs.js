// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-26

// Module: tcmd/core/fs
// Filesystem adapter interface plus a Node/Bun implementation. The core only
// talks to this interface, so a web build can swap in OPFS or HTTP backends.
//
// An adapter provides:
// - `readDir(path)`: Promise<FileEntry-like[]> - directory listing with stat info
// - `stat(path)`: Promise<{ isDir, isSymlink, size, mtimeMs, ctimeMs, mode, uid,
//   gid } | null>
// - `isDir(path)`: Promise<boolean>
// - `readTextHead(path, maxBytes)`: Promise<string> - leading bytes as text
// - `du(path)`: Promise<number> - recursive size in bytes
// - `disk(path)`: Promise<{ free, total } | null> - filesystem capacity
// - `copy(from, to)`, `move(from, to)`: Promise<void> - files or directories
// - `trash(paths)`, `erase(paths)`: Promise<void> - delete, with/without trash
// - `touch(path)`: Promise<void> - create or bump mtime
// - `home()`, `cwd()`: string - well-known directories
//
// A listing entry additionally reports symlinks as what they point at:
// `isSymlink` keeps the entry's own identity, `target` is the raw `readlink`
// text (relative as written, null otherwise), and `isDir`/`size` follow the
// link — so a link to a directory sorts, opens and previews as a directory,
// and a link to a file carries the target's size.

import fs from "node:fs/promises"
import nodeFs from "node:fs"
import nodeOs from "node:os"
import nodePath from "node:path"
import { extname, join as pathJoin } from "./path.js"

// Owner-name caches, filled lazily from /etc/passwd and /etc/group. Browsers
// and non-POSIX hosts never populate them (the adapters there omit `owner`).
let passwdNames = null
let groupNames = null

// Function: resolveOwner
// "user:group" for a uid/gid, resolving names from /etc/passwd and /etc/group
// (cached once). Falls back to the numeric ids, or "" when both are absent.
async function resolveOwner(uid, gid) {
	if (uid == null && gid == null) return ""
	if (process.platform !== "win32") {
		passwdNames ??= await parseColonFile("/etc/passwd", 2)
		groupNames ??= await parseColonFile("/etc/group", 2)
	}
	const user = uid == null ? "" : passwdNames?.get(uid) ?? `${uid}`
	const group = gid == null ? "" : groupNames?.get(gid) ?? `${gid}`
	return user && group ? `${user}:${group}` : user || group
}

// Function: parseColonFile
// Reads a passwd/group-style file into a `{ id -> name }` map; unreadable
// files yield an empty map (names then fall back to the numeric id).
async function parseColonFile(path, nameColumn) {
	const map = new Map()
	try {
		const text = await fs.readFile(path, "utf8")
		for (const line of text.split("\n")) {
			const parts = line.split(":")
			const id = Number(parts[2])
			if (parts.length > nameColumn && Number.isFinite(id)) map.set(id, parts[0])
		}
	} catch (error) {
		// No passwd/group file: numeric ids only.
	}
	return map
}

function toEntry(name, dirPath, isDir, stats) {
	const stat = stats || {}
	return {
		name,
		path: pathJoin(dirPath, name),
		isDir,
		isSymlink: Boolean(stat.isSymlink),
		// The raw `readlink` text — relative when the link was written that
		// way — so the listing and the preview can show where it points.
		target: stat.target ?? null,
		isDevice: Boolean(stat.isDevice),
		size: isDir ? 0 : stat.size ?? 0,
		mtimeMs: stat.mtimeMs ?? 0,
		ctimeMs: stat.ctimeMs ?? 0,
		mode: stat.mode ?? 0,
		uid: stat.uid ?? null,
		gid: stat.gid ?? null,
		ext: isDir ? null : extname(name),
	}
}

// Function: isDeviceNode
// True when a stat/dirent is a special node (block/char device, FIFO, socket).
function isDeviceNode(node) {
	return Boolean(
		node?.isBlockDevice?.() || node?.isCharacterDevice?.() || node?.isFIFO?.() || node?.isSocket?.(),
	)
}

// Function: createNodeFs
// Node/Bun-backed implementation of the filesystem adapter.
function createNodeFs() {
	const adapter = {
		async readDir(path) {
			const dirents = await fs.readdir(path, { withFileTypes: true })
			const entries = new Array(dirents.length)
			for (let i = 0; i < dirents.length; i++) {
				const d = dirents[i]
				const full = pathJoin(path, d.name)
				const stats = await statSafe(full)
				const isLink = d.isSymbolicLink()
				// The dirent type describes the link itself, not what it
				// points at: resolve through the followed stat so a link to a
				// directory is listed (sorted, opened, previewed) as one. A
				// broken link has no stats and stays a plain entry.
				const isDir = d.isDirectory() || (isLink && Boolean(stats?.isDir))
				entries[i] = toEntry(d.name, path, isDir, {
					isSymlink: isLink,
					target: isLink ? await readLinkSafe(full) : null,
					isDevice: isDeviceNode(d),
					size: stats?.size ?? 0,
					mtimeMs: stats?.mtimeMs ?? 0,
					ctimeMs: stats?.ctimeMs ?? 0,
					mode: stats?.mode ?? 0,
					uid: stats?.uid ?? null,
					gid: stats?.gid ?? null,
				})
				entries[i].owner = await resolveOwner(stats?.uid, stats?.gid)
			}
			return entries
		},
		async stat(path) {
			return statSafe(path)
		},
		async isDir(path) {
			const stats = await statSafe(path)
			return Boolean(stats?.isDir)
		},
		async readTextHead(path, maxBytes = 65536) {
			const file = nodeFs.openSync(path, "r")
			try {
				const buffer = Buffer.alloc(maxBytes)
				const bytes = nodeFs.readSync(file, buffer, 0, maxBytes, 0)
				return buffer.toString("utf8", 0, bytes)
			} finally {
				nodeFs.closeSync(file)
			}
		},
		async du(path) {
			return duSafe(path)
		},
		async disk(path) {
			try {
				const stats = await fs.statfs(path)
				return { free: Number(stats.bfree * stats.bsize), total: Number(stats.blocks * stats.bsize) }
			} catch (error) {
				return null
			}
		},
		async copy(from, to) {
			await fs.cp(from, to, { recursive: true })
		},
		async move(from, to) {
			try {
				await fs.rename(from, to)
			} catch (error) {
				if (error?.code !== "EXDEV") throw error
				await fs.cp(from, to, { recursive: true })
				await fs.rm(from, { recursive: true })
			}
		},
		async trash(paths) {
			const filesDir = trashDir("files")
			const infoDir = trashDir("info")
			await fs.mkdir(filesDir, { recursive: true })
			await fs.mkdir(infoDir, { recursive: true })
			for (const source of paths) {
				const absolute = nodePath.resolve(source)
				const name = await freeTrashName(filesDir, nodePath.basename(absolute))
				const target = nodePath.join(filesDir, name)
				try {
					await fs.rename(absolute, target)
				} catch (error) {
					if (error?.code !== "EXDEV") throw error
					await fs.cp(absolute, target, { recursive: true })
					await fs.rm(absolute, { recursive: true })
				}
				const info = `[Trash Info]\nPath=${absolute}\nDeletionDate=${new Date().toISOString()}\n`
				await fs.writeFile(nodePath.join(infoDir, `${name}.trashinfo`), info)
			}
		},
		async erase(paths) {
			for (const path of paths) await fs.rm(path, { recursive: true })
		},
		async touch(path) {
			const now = new Date()
			try {
				await fs.utimes(path, now, now)
			} catch (error) {
				const handle = await fs.open(path, "a")
				await handle.close()
			}
		},
		home() {
			return nodeOs.homedir()
		},
		cwd() {
			return process.cwd()
		},
	}
	return adapter
}

// Function: trashDir
// Freedesktop trash directory under $XDG_DATA_HOME (default
// ~/.local/share/Trash).
function trashDir(kind) {
	const dataHome = process.env.XDG_DATA_HOME || nodePath.join(nodeOs.homedir(), ".local", "share")
	return nodePath.join(dataHome, "Trash", kind)
}

// Function: freeTrashName
// First free `<name>`, `<name>.1`, … in the trash files directory.
async function freeTrashName(filesDir, base) {
	for (let i = 0; ; i++) {
		const name = i === 0 ? base : `${base}.${i}`
		try {
			await fs.access(nodePath.join(filesDir, name))
		} catch (error) {
			return name
		}
	}
}

async function statSafe(path) {
	try {
		const stats = await fs.stat(path)
		return {
			isDir: stats.isDirectory(),
			isSymlink: stats.isSymbolicLink(),
			isDevice: isDeviceNode(stats),
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			ctimeMs: stats.ctimeMs,
			mode: stats.mode,
			uid: stats.uid,
			gid: stats.gid,
			owner: await resolveOwner(stats.uid, stats.gid),
		}
	} catch (error) {
		return null
	}
}

// Function: readLinkSafe
// The raw `readlink` text of `path`, or null when it is not a link (or the
// link cannot be read). Relative targets stay relative, as written.
async function readLinkSafe(path) {
	try {
		return await fs.readlink(path)
	} catch (error) {
		return null
	}
}

// Function: duSafe
// Recursive disk usage; unreadable entries contribute 0 and never throw.
async function duSafe(path) {
	const stats = await statSafe(path)
	if (!stats) return 0
	if (!stats.isDir) return stats.size
	let total = 0
	let dirents
	try {
		dirents = await fs.readdir(path, { withFileTypes: true })
	} catch (error) {
		return 0
	}
	for (const d of dirents) {
		const full = pathJoin(path, d.name)
		if (d.isDirectory()) total += await duSafe(full)
		else if (!d.isSymbolicLink()) {
			const child = await statSafe(full)
			total += child?.size ?? 0
		}
	}
	return total
}

export { createNodeFs }

// EOF
