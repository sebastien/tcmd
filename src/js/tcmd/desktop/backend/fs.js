// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/backend/fs
// txiki.js implementation of the filesystem adapter contract. Keep the
// runtime injectable so these operations can be tested under Bun without
// importing Node builtins into the shipped backend.

import { extname } from "../../core/path.js"

const PREVIEW_LIMIT = 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function normalizePath(value, base = "/") {
	if (typeof value !== "string" || !value || value.includes("\0")) {
		throw new TypeError("path must be a non-empty string without NUL bytes")
	}
	const source = value.startsWith("/") ? value : `${base}/${value}`
	const parts = []
	for (const part of source.split("/")) {
		if (!part || part === ".") continue
		if (part === "..") parts.pop()
		else parts.push(part)
	}
	return `/${parts.join("/")}`
}

function joinPath(base, name) {
	return `${base === "/" ? "" : base}/${name}`
}

function basename(path) {
	const parts = path.split("/").filter(Boolean)
	return parts.at(-1) ?? "/"
}

function dirname(path) {
	const parts = path.split("/").filter(Boolean)
	if (parts.length <= 1) return "/"
	return `/${parts.slice(0, -1).join("/")}`
}

function isWithin(parent, child) {
	return parent === child || (parent === "/" ? child.startsWith("/") : child.startsWith(`${parent}/`))
}

function isDevice(stats) {
	return Boolean(stats?.isBlockDevice || stats?.isCharacterDevice || stats?.isFIFO || stats?.isSocket)
}

function timeMs(value) {
	if (value instanceof Date) return value.getTime()
	const number = Number(value)
	return Number.isFinite(number) ? number : 0
}

function statEntry(stats, overrides = {}) {
	return {
		isDir: Boolean(stats?.isDirectory),
		isSymlink: Boolean(overrides.isSymlink ?? stats?.isSymbolicLink),
		isDevice: isDevice(stats),
		size: Number(stats?.size ?? 0),
		mtimeMs: timeMs(stats?.mtim ?? stats?.mtimeMs),
		ctimeMs: timeMs(stats?.ctim ?? stats?.ctimeMs),
		mode: Number(stats?.mode ?? 0),
		uid: stats?.uid == null ? null : Number(stats.uid),
		gid: stats?.gid == null ? null : Number(stats.gid),
		owner: "",
	}
}

function missing(error) {
	return error?.code === "ENOENT" || error?.code === "ENOTDIR"
}

function pathExistsError(path) {
	const error = new Error(`destination already exists: ${path}`)
	error.code = "EEXIST"
	return error
}

function parseTrashInfo(text) {
	const info = {}
	for (const line of `${text ?? ""}`.split("\n")) {
		const at = line.indexOf("=")
		if (at <= 0) continue
		const key = line.slice(0, at).trim()
		const value = line.slice(at + 1).trim()
		if (key === "Path") {
			try {
				info[key] = decodeURIComponent(value)
			} catch {
				info[key] = value
			}
		} else if (key === "DeletionDate") info[key] = value
	}
	return info
}

function encodeTrashPath(path) {
	return path.split("/").map((part) => encodeURIComponent(part)).join("/")
}

function assertNoNested(paths) {
	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			if (isWithin(paths[i], paths[j]) || isWithin(paths[j], paths[i])) {
				throw new Error(`overlapping paths: ${paths[i]} and ${paths[j]}`)
			}
		}
	}
}

function createDesktopFs(options = {}) {
	const runtime = options.runtime
	if (!runtime) throw new TypeError("txiki.js runtime is required")
	let { home = runtime.homeDir, cwd = runtime.cwd, env = runtime.env ?? {} } = options
	if (env.OS === "Windows_NT") {
		throw new Error("The tcmd desktop filesystem does not support Windows drive or UNC paths yet")
	}
	const root = "/"
	home = normalizePath(home || "/")
	cwd = normalizePath(cwd || home, home)
	const dataHome = env.XDG_DATA_HOME?.startsWith("/")
		? normalizePath(env.XDG_DATA_HOME)
		: joinPath(home, ".local/share")
	const trashRoot = joinPath(dataHome, "Trash")
	const trashFiles = joinPath(trashRoot, "files")
	const trashInfo = joinPath(trashRoot, "info")
	const pathLocks = new Map()

	const pathArg = (path) => normalizePath(path, cwd)

	async function lstatOrNull(path) {
		try {
			return await runtime.lstat(path)
		} catch (error) {
			if (missing(error)) return null
			throw error
		}
	}

	async function statSafe(path) {
		try {
			return statEntry(await runtime.stat(path))
		} catch {
			return null
		}
	}

	async function withPathLock(path, action) {
		const key = pathArg(path)
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

	function assertMutable(path) {
		if (path === root) throw new Error("refusing to modify the filesystem root")
		if (isWithin(trashRoot, path) || isWithin(path, trashRoot)) {
			throw new Error("refusing to modify an internal trash path or its parent")
		}
	}

	async function readDirNames(path) {
		const handle = await runtime.readDir(path)
		const names = []
		try {
			for await (const entry of handle) names.push(entry.name)
		} finally {
			await handle.close?.()
		}
		return names
	}

	async function physicalPath(path) {
		try {
			return await runtime.realPath(path)
		} catch (error) {
			// Resolve the closest existing ancestor when the destination is new.
			if (!missing(error) || path === root) throw error
			return joinPath(await physicalPath(dirname(path)), basename(path))
		}
	}

	async function assertCopySafe(from, to) {
		const source = await runtime.lstat(from)
		if (source.isDirectory) {
			if (isWithin(from, to) || isWithin(await runtime.realPath(from), await physicalPath(to))) {
				throw new Error(`cannot copy a path into itself: ${to}`)
			}
		}
		const destination = await lstatOrNull(to)
		if (!destination) return
		if (!source.isDirectory || !destination.isDirectory) throw pathExistsError(to)
		for (const name of await readDirNames(from)) {
			await assertCopySafe(joinPath(from, name), joinPath(to, name))
		}
	}

	async function copyEntry(from, to) {
		const source = await runtime.lstat(from)
		const destination = await lstatOrNull(to)
		if (source.isSymbolicLink) {
			if (destination) throw pathExistsError(to)
			const target = await runtime.readLink(from)
			await runtime.symlink(target, to)
			return
		}
		if (source.isDirectory) {
			if (destination && !destination.isDirectory) throw pathExistsError(to)
			// Keep new directories private and owner-writable while populating,
			// including when the source is read-only. Apply its exact mode last
			// (mkdir's mode is filtered by umask). Merges retain destination modes.
			if (!destination) await runtime.makeDir(to, { mode: 0o700 })
			for (const name of await readDirNames(from)) {
				await copyEntry(joinPath(from, name), joinPath(to, name))
			}
			if (!destination) await runtime.chmod(to, Number(source.mode) & 0o7777)
			return
		}
		if (!source.isFile) throw new Error(`cannot copy a special filesystem entry: ${from}`)
		if (destination) throw pathExistsError(to)
		await runtime.copyFile(from, to)
	}

	async function copy(fromValue, toValue) {
		const from = pathArg(fromValue)
		const to = pathArg(toValue)
		assertMutable(to)
		return withPathLock(to, async () => {
			await assertCopySafe(from, to)
			await copyEntry(from, to)
		})
	}

	async function movePaths(fromValue, toValue, { internal = false } = {}) {
		const from = pathArg(fromValue)
		const to = pathArg(toValue)
		if (!internal) {
			assertMutable(from)
			assertMutable(to)
		}
		if (from === to || isWithin(from, to)) throw new Error(`cannot move a path into itself: ${to}`)
		return withPathLock(to, async () => {
			const source = await lstatOrNull(from)
			if (!source) throw Object.assign(new Error(`not found: ${from}`), { code: "ENOENT" })
			if (await lstatOrNull(to)) throw pathExistsError(to)
			try {
				await runtime.rename(from, to)
			} catch (error) {
				if (error?.code !== "EXDEV") throw error
				await assertCopySafe(from, to)
				await copyEntry(from, to)
				try {
					await runtime.remove(from)
				} catch (removeError) {
					throw new Error(`copied to ${to}, but could not remove the original ${from}: ${removeError.message}`, {
						cause: removeError,
					})
				}
			}
		})
	}

	const move = (from, to) => movePaths(from, to)

	async function reserveTrashName(base) {
		for (let index = 0; ; index++) {
			const name = index ? `${base}.${index}` : base
			const file = joinPath(trashFiles, name)
			if (await lstatOrNull(file)) continue
			const infoFile = joinPath(trashInfo, `${name}.trashinfo`)
			let handle
			try {
				handle = await runtime.open(infoFile, "wx")
			} catch (error) {
				if (error?.code === "EEXIST") continue
				throw error
			}
			if (await lstatOrNull(file)) {
				await handle.close()
				await runtime.remove(infoFile)
				continue
			}
			return { name, file, infoFile, handle }
		}
	}

	async function writeHandle(handle, text) {
		const bytes = encoder.encode(text)
		let offset = 0
		while (offset < bytes.length) {
			const written = await handle.write(bytes.subarray(offset), offset)
			if (!written) throw new Error("could not write trash metadata")
			offset += written
		}
	}

	const adapter = {
		async readDir(pathValue) {
			const path = pathArg(pathValue)
			const handle = await runtime.readDir(path)
			const entries = []
			try {
				for await (const dirent of handle) {
					const full = joinPath(path, dirent.name)
					let linkStats = null
					try {
						linkStats = await runtime.lstat(full)
					} catch {
						// Keep the directory entry visible if stat races with removal.
					}
					let followed = null
					try {
						followed = await runtime.stat(full)
					} catch {
						// Broken symlinks remain visible as non-directories.
					}
					const symlink = Boolean(linkStats?.isSymbolicLink ?? dirent.isSymbolicLink)
					let target = null
					if (symlink) {
						try {
							target = await runtime.readLink(full)
						} catch {
							// Link target text is supplemental metadata.
						}
					}
					const stat = statEntry(followed ?? linkStats, { isSymlink: symlink })
					const isDir = Boolean(dirent.isDirectory || (symlink && followed?.isDirectory))
					entries.push({
						name: dirent.name,
						path: full,
						isDir,
						isSymlink: symlink,
						target,
						isDevice: isDevice(linkStats ?? dirent),
						size: isDir ? 0 : Number(followed?.size ?? (symlink ? 0 : stat.size)),
						mtimeMs: stat.mtimeMs,
						ctimeMs: stat.ctimeMs,
						mode: stat.mode,
						uid: stat.uid,
						gid: stat.gid,
						owner: "",
						ext: isDir ? null : extname(dirent.name),
					})
				}
			} finally {
				await handle.close?.()
			}
			return entries
		},
		async stat(pathValue) {
			return statSafe(pathArg(pathValue))
		},
		async isDir(pathValue) {
			return Boolean((await adapter.stat(pathValue))?.isDir)
		},
		async readTextHead(pathValue, maxBytes = 65536) {
			const path = pathArg(pathValue)
			const requested = Number(maxBytes)
			const length = Number.isFinite(requested)
				? Math.max(0, Math.min(PREVIEW_LIMIT, Math.floor(requested)))
				: 65536
			if (!length) return ""
			const handle = await runtime.open(path, "r")
			try {
				const buffer = new Uint8Array(length)
				let count = 0
				while (count < length) {
					const read = await handle.read(buffer.subarray(count), count)
					if (read == null || read === 0) break
					count += read
				}
				return decoder.decode(buffer.subarray(0, count))
			} finally {
				await handle.close()
			}
		},
		async du(pathValue) {
			const path = pathArg(pathValue)
			const rootStat = await statSafe(path)
			if (!rootStat) return 0
			if (!rootStat.isDir) return rootStat.size
			let total = 0
			const visit = async (directory) => {
				for (const entry of await adapter.readDir(directory)) {
					if (entry.isSymlink || entry.isDevice) continue
					if (entry.isDir) await visit(entry.path)
					else total += entry.size
				}
			}
			await visit(path)
			return total
		},
		async disk(pathValue) {
			try {
				const stats = await runtime.statFs(pathArg(pathValue))
				return {
					free: Number(stats.bfree * stats.bsize),
					total: Number(stats.blocks * stats.bsize),
				}
			} catch {
				return null
			}
		},
		copy,
		move,
		async mkdir(pathValue) {
			const path = pathArg(pathValue)
			assertMutable(path)
			await runtime.makeDir(path, { recursive: true })
		},
		async trash(paths) {
			const sources = (paths ?? []).map(pathArg)
			assertNoNested(sources)
			for (const path of sources) {
				assertMutable(path)
				if (!(await lstatOrNull(path))) throw Object.assign(new Error(`not found: ${path}`), { code: "ENOENT" })
			}
			await runtime.makeDir(trashFiles, { recursive: true })
			await runtime.makeDir(trashInfo, { recursive: true })
			const trashed = []
			for (const from of sources) {
				const { name, file, infoFile, handle } = await reserveTrashName(basename(from))
				try {
					await writeHandle(
						handle,
						`[Trash Info]\nPath=${encodeTrashPath(from)}\nDeletionDate=${new Date().toISOString()}\n`,
					)
				} catch (error) {
					await runtime.remove(infoFile).catch(() => {})
					throw error
				} finally {
					await handle.close()
				}
				try {
					await movePaths(from, file, { internal: true })
				} catch (error) {
					await runtime.remove(infoFile).catch(() => {})
					throw error
				}
				trashed.push({ from, to: file, name })
			}
			return trashed
		},
		async trashList() {
			let names
			try {
				names = await readDirNames(trashInfo)
			} catch (error) {
				if (missing(error)) return []
				throw error
			}
			const rows = []
			for (const filename of names) {
				if (!filename.endsWith(".trashinfo")) continue
				const name = filename.slice(0, -".trashinfo".length)
				const trashPath = joinPath(trashFiles, name)
				let info = {}
				try {
					info = parseTrashInfo(decoder.decode(await runtime.readFile(joinPath(trashInfo, filename))))
				} catch {
					// Show the item even if its metadata has gone missing.
				}
				const stats = await lstatOrNull(trashPath)
				if (!stats) continue
				rows.push({
					name,
					originalPath: info.Path ?? null,
					deletedAt: info.DeletionDate ?? null,
					trashPath,
					isDir: Boolean(stats.isDirectory),
				})
			}
			return rows.sort((a, b) => `${b.deletedAt ?? ""}`.localeCompare(`${a.deletedAt ?? ""}`))
		},
		async restore(paths, { validateDestination } = {}) {
			const restores = []
			const destinations = new Set()
			for (const value of paths ?? []) {
				const trashPath = pathArg(value)
				if (dirname(trashPath) !== trashFiles) throw new Error(`not a trash entry: ${value}`)
				const name = basename(trashPath)
				const infoFile = joinPath(trashInfo, `${name}.trashinfo`)
				const info = parseTrashInfo(decoder.decode(await runtime.readFile(infoFile)))
				if (!info.Path?.startsWith("/")) throw new Error(`no valid original path recorded for ${name}`)
				const original = pathArg(info.Path)
				assertMutable(original)
				const destination = validateDestination ? pathArg(await validateDestination(original)) : original
				if (destinations.has(destination) || (await lstatOrNull(destination))) {
					throw pathExistsError(destination)
				}
				destinations.add(destination)
				restores.push({ trashPath, infoFile, destination })
			}
			assertNoNested(restores.map((restore) => restore.destination))
			for (const { trashPath, infoFile, destination } of restores) {
				if (await lstatOrNull(destination)) throw pathExistsError(destination)
				await runtime.makeDir(dirname(destination), { recursive: true })
				await movePaths(trashPath, destination, { internal: true })
				await runtime.remove(infoFile)
			}
		},
		async erase(paths) {
			const targets = (paths ?? []).map(pathArg)
			assertNoNested(targets)
			for (const path of targets) assertMutable(path)
			for (const path of targets) await runtime.remove(path)
		},
		async touch(pathValue) {
			const path = pathArg(pathValue)
			assertMutable(path)
			const now = new Date()
			try {
				await runtime.utime(path, now, now)
			} catch (error) {
				if (!missing(error)) throw error
				const handle = await runtime.open(path, "a")
				await handle.close()
			}
		},
		home: () => home,
		cwd: () => cwd,
		root: () => root,
	}
	return adapter
}

export { createDesktopFs, dirname, isWithin, normalizePath }

// EOF
