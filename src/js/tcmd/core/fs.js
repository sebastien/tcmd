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
// - `copy(from, to)`, `move(from, to)`: Promise<void> - files or directories;
//   copy can merge directories but never replaces an existing entry, and move
//   requires an absent destination
// - `mkdir(path)`: Promise<void> - create a directory (parents included)
// - `trash(paths)`: Promise<TrashedEntry[]> - move to the freedesktop trash,
//   returning `{ from, to, name }` per path (`to` is the trash copy)
// - `trashList()`: Promise<TrashInfo[]> - the trash contents, newest first,
//   as `{ name, originalPath, deletedAt, trashPath, isDir }`
// - `restore(trashPaths, options?)`: Promise<void> - move trashed entries back
//   to their recorded original paths; `validateDestination(path)` is an
//   optional host guard (used by the scoped web server)
// - `erase(paths)`: Promise<void> - delete without trash
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
import { createLimiter, mapLimit } from "./concurrency.js"
import { SEP, extname, join as pathJoin, normalize } from "./path.js"
import { PREVIEW_BYTES } from "./preview.js"

// Owner-name caches, filled lazily from /etc/passwd and /etc/group. Browsers
// and non-POSIX hosts never populate them (the adapters there omit `owner`).
let passwdNames = null
let groupNames = null
// ponytail: process-local destination locks serialize callers here; cross-process no-replace moves need native support.
const pathLocks = new Map()

// Function: loadOwners
// Fills the passwd/group caches once, so `ownerOf` can resolve synchronously.
// A listing resolves its owners after a single `loadOwners()`, instead of one
// async round-trip per entry.
async function loadOwners() {
	if (process.platform !== "win32") {
		passwdNames ??= await parseColonFile("/etc/passwd", 2)
		groupNames ??= await parseColonFile("/etc/group", 2)
	}
}

// Function: ownerOf
// "user:group" for a uid/gid from the (already loaded) names maps. Falls back
// to the numeric ids, or "" when both are absent.
function ownerOf(uid, gid) {
	if (uid == null && gid == null) return ""
	const user = uid == null ? "" : passwdNames?.get(uid) ?? `${uid}`
	const group = gid == null ? "" : groupNames?.get(gid) ?? `${gid}`
	return user && group ? `${user}:${group}` : user || group
}

// Function: resolveOwner
// "user:group" for a uid/gid, loading the names maps on first use. Falls back
// to the numeric ids, or "" when both are absent.
async function resolveOwner(uid, gid) {
	if (uid == null && gid == null) return ""
	await loadOwners()
	return ownerOf(uid, gid)
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

// Function: toEntry
// Builds a listing entry. `prefix` is the directory path already ending in the
// separator, so the listing joins it once instead of normalizing the directory
// path per entry.
function toEntry(name, prefix, isDir, stats) {
	const stat = stats || {}
	return {
		name,
		path: prefix + name,
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

// Constant: READDIR_CONCURRENCY
// Per-entry stats in a listing are issued concurrently, bounded so a huge
// directory does not queue tens of thousands of requests at once. The Node
// threadpool services a handful of filesystem calls at a time, so a modest
// bound keeps it saturated without the memory churn of one promise per entry.
const READDIR_CONCURRENCY = 64

// Constant: DU_CONCURRENCY
// Global in-flight bound for the recursive `du` walk, shared across every
// directory level (see `duSafe`).
const DU_CONCURRENCY = 64

// Function: createNodeFs
// Node/Bun-backed implementation of the filesystem adapter.
function createNodeFs() {
	const adapter = {
		async readDir(path) {
			const dirents = await fs.readdir(path, { withFileTypes: true })
			// Normalize the directory once, not per entry: `toEntry` appends the
			// name to this prefix.
			const normalized = normalize(path)
			const prefix = normalized === SEP ? SEP : normalized + SEP
			// Resolve owners from the cached maps, once, up front: the per-entry
			// work below then stays purely filesystem-bound and parallel.
			await loadOwners()
			return mapLimit(dirents, READDIR_CONCURRENCY, async (d) => {
				const full = prefix + d.name
				const stats = await statDetails(full)
				const isLink = d.isSymbolicLink()
				// The dirent type describes the link itself, not what it
				// points at: resolve through the followed stat so a link to a
				// directory is listed (sorted, opened, previewed) as one. A
				// broken link has no stats and stays a plain entry.
				const isDir = d.isDirectory() || (isLink && Boolean(stats?.isDir))
				const entry = toEntry(d.name, prefix, isDir, {
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
				entry.owner = ownerOf(stats?.uid, stats?.gid)
				return entry
			})
		},
		async stat(path) {
			return statSafe(path)
		},
		async isDir(path) {
			const stats = await statSafe(path)
			return Boolean(stats?.isDir)
		},
		async readTextHead(path, maxBytes = PREVIEW_BYTES) {
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
			return withPathLock(to, async () => {
				await assertCopySafe(from, to)
				await fs.cp(from, to, { recursive: true })
			})
		},
		async move(from, to) {
			await moveSafe(from, to)
		},
		async mkdir(path) {
			await fs.mkdir(path, { recursive: true })
		},
		async trash(paths) {
			const filesDir = trashDir("files")
			const infoDir = trashDir("info")
			await fs.mkdir(filesDir, { recursive: true })
			await fs.mkdir(infoDir, { recursive: true })
			const trashed = []
			for (const source of paths) {
				const absolute = nodePath.resolve(source)
				const { name, infoFile, handle } = await reserveTrashName(
					filesDir,
					infoDir,
					nodePath.basename(absolute),
				)
				const target = nodePath.join(filesDir, name)
				const info = `[Trash Info]\nPath=${encodeTrashPath(absolute)}\nDeletionDate=${new Date().toISOString()}\n`
				try {
					await handle.writeFile(info)
					await handle.close()
				} catch (error) {
					await handle.close().catch(() => {})
					await fs.rm(infoFile, { force: true })
					throw error
				}
				await handle.close()
				try {
					await moveSafe(absolute, target)
				} catch (error) {
					await fs.rm(infoFile, { force: true })
					throw error
				}
				trashed.push({ from: absolute, to: target, name })
			}
			return trashed
		},
		async trashList() {
			const filesDir = trashDir("files")
			const infoDir = trashDir("info")
			let files
			try {
				files = await fs.readdir(infoDir)
			} catch (error) {
				return []
			}
			const rows = []
			for (const file of files) {
				if (!file.endsWith(".trashinfo")) continue
				const name = file.slice(0, -".trashinfo".length)
				const trashPath = nodePath.join(filesDir, name)
				let info = {}
				try {
					info = parseTrashInfo(await fs.readFile(nodePath.join(infoDir, file), "utf8"))
				} catch (error) {
					// A missing or unreadable info file leaves the row without a
					// recorded original path; it is still listed.
				}
				let stats
				try {
					stats = await fs.lstat(trashPath)
				} catch (error) {
					if (error?.code === "ENOENT") continue
					throw error
				}
				rows.push({
					name,
					originalPath: info.Path ?? null,
					deletedAt: info.DeletionDate ?? null,
					trashPath,
					isDir: stats.isDirectory(),
				})
			}
			return rows.sort((a, b) => `${b.deletedAt ?? ""}`.localeCompare(`${a.deletedAt ?? ""}`))
		},
		async restore(trashPaths, { validateDestination } = {}) {
			const filesDir = nodePath.resolve(trashDir("files"))
			const infoDir = trashDir("info")
			const restores = []
			const destinations = new Set()
			for (const path of trashPaths ?? []) {
				const trashPath = nodePath.resolve(path)
				if (nodePath.dirname(trashPath) !== filesDir) throw new Error(`not a trash entry: ${path}`)
				const name = nodePath.basename(trashPath)
				const infoFile = nodePath.join(infoDir, `${name}.trashinfo`)
				const info = parseTrashInfo(await fs.readFile(infoFile, "utf8"))
				if (!info.Path) throw new Error(`no original path recorded for ${name}`)
				if (!nodePath.isAbsolute(info.Path)) throw new Error(`invalid original path for ${name}`)
				const destination = validateDestination ? await validateDestination(info.Path) : info.Path
				if (destinations.has(destination) || (await pathExists(destination))) {
					throw pathExistsError(destination)
				}
				destinations.add(destination)
				restores.push({ trashPath, infoFile, destination })
			}
			assertNoNestedDestinations(restores.map((restore) => restore.destination))
			for (const { trashPath, infoFile, destination } of restores) {
				if (await pathExists(destination)) throw pathExistsError(destination)
				await fs.mkdir(nodePath.dirname(destination), { recursive: true })
				await moveSafe(trashPath, destination)
				await fs.rm(infoFile, { force: true })
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

// Function: reserveTrashName
// Atomically reserves the `.trashinfo` name so concurrent trash operations do
// not choose the same files/info pair.
async function reserveTrashName(filesDir, infoDir, base) {
	for (let i = 0; ; i++) {
		const name = i === 0 ? base : `${base}.${i}`
		const target = nodePath.join(filesDir, name)
		const infoFile = nodePath.join(infoDir, `${name}.trashinfo`)
		if (await pathExists(target)) continue
		let handle
		try {
			handle = await fs.open(infoFile, "wx")
		} catch (error) {
			if (error?.code === "EEXIST") continue
			throw error
		}
		if (await pathExists(target)) {
			await handle.close()
			await fs.rm(infoFile, { force: true })
			continue
		}
		return { name, infoFile, handle }
	}
}

// Function: moveSafe
// Renames `from` to `to`, falling back to copy+remove across filesystems
// (EXDEV), where `rename` cannot cross devices.
async function moveSafe(from, to) {
	return withPathLock(to, async () => {
		if (await pathExists(to)) throw pathExistsError(to)
		try {
			await fs.rename(from, to)
		} catch (error) {
			if (error?.code !== "EXDEV") throw error
			await fs.cp(from, to, { recursive: true })
			await fs.rm(from, { recursive: true })
		}
	})
}

async function withPathLock(path, action) {
	const key = nodePath.resolve(path)
	const previous = pathLocks.get(key) ?? Promise.resolve()
	let release
	const gate = new Promise((resolve) => (release = resolve))
	const tail = previous.then(() => gate)
	pathLocks.set(key, tail)
	await previous
	try {
		return await action()
	} finally {
		release()
		if (pathLocks.get(key) === tail) pathLocks.delete(key)
	}
}

async function assertCopySafe(from, to) {
	const source = await fs.lstat(from)
	const sourcePath = nodePath.resolve(from)
	const targetPath = nodePath.resolve(to)
	const relative = nodePath.relative(sourcePath, targetPath)
	if (
		sourcePath === targetPath ||
		(source.isDirectory() && relative && relative !== ".." && !relative.startsWith(`..${nodePath.sep}`) && !nodePath.isAbsolute(relative))
	) {
		throw new Error(`cannot copy a path into itself: ${to}`)
	}
	let destination
	try {
		destination = await fs.lstat(to)
	} catch (error) {
		if (error?.code === "ENOENT") return
		throw error
	}
	if (!source.isDirectory() || !destination.isDirectory()) throw pathExistsError(to)
	for (const name of await fs.readdir(from)) {
		await assertCopySafe(nodePath.join(from, name), nodePath.join(to, name))
	}
}

function assertNoNestedDestinations(paths) {
	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			const relative = nodePath.relative(paths[i], paths[j])
			const reverse = nodePath.relative(paths[j], paths[i])
			if (
				(relative && relative !== ".." && !relative.startsWith(`..${nodePath.sep}`) && !nodePath.isAbsolute(relative)) ||
				(reverse && reverse !== ".." && !reverse.startsWith(`..${nodePath.sep}`) && !nodePath.isAbsolute(reverse))
			) {
				throw pathExistsError(paths[j])
			}
		}
	}
}

// Function: parseTrashInfo
// Parses a freedesktop `.trashinfo` file (`Key=Value` lines under a
// `[Trash Info]` header) into a `{ Path, DeletionDate }` map.
function parseTrashInfo(text) {
	const info = {}
	for (const line of `${text ?? ""}`.split("\n")) {
		const eq = line.indexOf("=")
		if (eq <= 0) continue
		const key = line.slice(0, eq).trim()
		const value = line.slice(eq + 1).trim()
		if (key === "Path") {
			try {
				info[key] = decodeURIComponent(value)
			} catch (error) {
				info[key] = value
			}
		} else {
			info[key] = value
		}
	}
	return info
}

// Function: encodeTrashPath
// Percent-encodes path components for the freedesktop `.trashinfo` format.
function encodeTrashPath(path) {
	return `${path}`.split(nodePath.sep).map(encodeURIComponent).join(nodePath.sep)
}

async function pathExists(path) {
	try {
		await fs.lstat(path)
		return true
	} catch (error) {
		if (error?.code === "ENOENT") return false
		throw error
	}
}

function pathExistsError(path) {
	const error = new Error(`destination already exists: ${path}`)
	error.code = "EEXIST"
	return error
}

// Function: statDetails
// The stat fields a listing needs, with no owner lookup — `readDir` resolves
// owners itself, from the cached maps, so the per-entry work stays parallel.
async function statDetails(path) {
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
		}
	} catch (error) {
		return null
	}
}

async function statSafe(path) {
	const details = await statDetails(path)
	if (!details) return null
	return { ...details, owner: await resolveOwner(details.uid, details.gid) }
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
// Recursive disk usage; unreadable entries contribute 0 and never throw. The
// walk fans out per directory but every filesystem call takes a slot from one
// global limiter, so a deep tree cannot multiply the concurrency per level.
const duLimit = createLimiter(DU_CONCURRENCY)
async function duSafe(path) {
	const stats = await duLimit(() => statDetails(path))
	if (!stats) return 0
	if (!stats.isDir) return stats.size
	let dirents
	try {
		dirents = await duLimit(() => fs.readdir(path, { withFileTypes: true }))
	} catch (error) {
		return 0
	}
	const sizes = await mapLimit(dirents, DU_CONCURRENCY, (d) => {
		// A symlink contributes nothing, matching the old link guard.
		if (d.isSymbolicLink()) return 0
		const full = pathJoin(path, d.name)
		if (d.isDirectory()) return duSafe(full)
		return duLimit(() => statDetails(full)).then((child) => child?.size ?? 0)
	})
	let total = 0
	for (const size of sizes) total += size
	return total
}

export { createNodeFs }

// EOF
