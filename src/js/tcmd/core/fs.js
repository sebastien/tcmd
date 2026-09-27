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
// - `stat(path)`: Promise<{ isDir, isSymlink, size, mtimeMs } | null>
// - `readTextHead(path, maxBytes)`: Promise<string> - leading bytes as text
// - `disk(path)`: Promise<{ free, total } | null> - filesystem capacity
// - `home()`, `cwd()`: string - well-known directories
// - `isDir(path)`: Promise<boolean>

import fs from "node:fs/promises"
import nodeFs from "node:fs"
import nodeOs from "node:os"
import { join as pathJoin } from "./path.js"

function toEntry(name, dirPath, isDir, stats) {
	const stat = stats || {}
	return {
		name,
		path: pathJoin(dirPath, name),
		isDir,
		isSymlink: Boolean(stat.isSymlink),
		size: isDir ? 0 : stat.size ?? 0,
		mtimeMs: stat.mtimeMs ?? 0,
		ext: isDir ? null : extensionOf(name),
	}
}

function extensionOf(name) {
	const at = name.lastIndexOf(".")
	return at > 0 ? name.slice(at + 1).toLowerCase() : null
}

// Function: createNodeFs
// Node/Bun-backed implementation of the filesystem adapter.
function createNodeFs() {
	return {
		async readDir(path) {
			const dirents = await fs.readdir(path, { withFileTypes: true })
			const entries = new Array(dirents.length)
			for (let i = 0; i < dirents.length; i++) {
				const d = dirents[i]
				const full = pathJoin(path, d.name)
				const stats = d.isDirectory()
					? null
					: await statSafe(full)
				entries[i] = toEntry(d.name, path, d.isDirectory(), {
					isSymlink: d.isSymbolicLink(),
					size: stats?.size ?? 0,
					mtimeMs: stats?.mtimeMs ?? 0,
				})
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
		async disk(path) {
			try {
				const stats = await fs.statfs(path)
				return { free: Number(stats.bfree * stats.bsize), total: Number(stats.blocks * stats.bsize) }
			} catch (error) {
				return null
			}
		},
		home() {
			return nodeOs.homedir()
		},
		cwd() {
			return process.cwd()
		},
	}
}

async function statSafe(path) {
	try {
		const stats = await fs.stat(path)
		return {
			isDir: stats.isDirectory(),
			isSymlink: stats.isSymbolicLink(),
			size: stats.size,
			mtimeMs: stats.mtimeMs,
		}
	} catch (error) {
		return null
	}
}

export { createNodeFs }

// EOF
