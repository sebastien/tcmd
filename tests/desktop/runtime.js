import fs from "node:fs/promises"
import { spawn } from "node:child_process"
import { Readable } from "node:stream"

function toStats(stats) {
	return {
		isBlockDevice: stats.isBlockDevice(),
		isCharacterDevice: stats.isCharacterDevice(),
		isDirectory: stats.isDirectory(),
		isFIFO: stats.isFIFO(),
		isFile: stats.isFile(),
		isSocket: stats.isSocket(),
		isSymbolicLink: stats.isSymbolicLink(),
		size: stats.size,
		mode: stats.mode,
		uid: stats.uid,
		gid: stats.gid,
		mtim: stats.mtime,
		ctim: stats.ctime,
	}
}

function asWebStream(stream) {
	return Readable.toWeb(stream)
}

function createNodeRuntime({ home, cwd = home, env = {} } = {}) {
	return {
		homeDir: home,
		cwd,
		hostName: "desktop-test",
		env: { OS: "Linux", HOME: home, ...env },
		async readDir(path) {
			const entries = await fs.readdir(path, { withFileTypes: true })
			return {
				async *[Symbol.asyncIterator]() {
					for (const entry of entries) {
						yield {
							name: entry.name,
							isBlockDevice: entry.isBlockDevice(),
							isCharacterDevice: entry.isCharacterDevice(),
							isDirectory: entry.isDirectory(),
							isFIFO: entry.isFIFO(),
							isFile: entry.isFile(),
							isSocket: entry.isSocket(),
							isSymbolicLink: entry.isSymbolicLink(),
						}
					}
				},
				async close() {},
			}
		},
		async stat(path) {
			return toStats(await fs.stat(path))
		},
		async lstat(path) {
			return toStats(await fs.lstat(path))
		},
		readLink: (path) => fs.readlink(path),
		realPath: (path) => fs.realpath(path),
		chmod: (path, mode) => fs.chmod(path, mode),
		async open(path, flags) {
			const handle = await fs.open(path, flags)
			return {
				async read(buffer, position) {
					const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
					return bytesRead || null
				},
				async write(buffer, position) {
					const { bytesWritten } = await handle.write(buffer, 0, buffer.length, position)
					return bytesWritten
				},
				close: () => handle.close(),
			}
		},
		readFile: (path) => fs.readFile(path),
		copyFile: (from, to) => fs.copyFile(from, to),
		remove: (path) => fs.rm(path, { recursive: true }),
		makeDir: (path, options) => fs.mkdir(path, { recursive: Boolean(options?.recursive), mode: options?.mode }),
		rename: (from, to) => fs.rename(from, to),
		symlink: (target, path) => fs.symlink(target, path),
		utime: (path, atime, mtime) => fs.utimes(path, atime, mtime),
		async statFs(path) {
			const stat = await fs.statfs(path)
			return { bfree: Number(stat.bfree), blocks: Number(stat.blocks), bsize: Number(stat.bsize) }
		},
		spawn(args, options) {
			const child = spawn(args[0], args.slice(1), {
				cwd: options.cwd,
				stdio: ["ignore", "pipe", "pipe"],
			})
			return {
				stdout: asWebStream(child.stdout),
				stderr: asWebStream(child.stderr),
				wait: () => new Promise((resolve, reject) => {
					child.once("error", reject)
					child.once("exit", (code, signal) => resolve({ exit_status: code ?? 1, term_signal: signal }))
				}),
			}
		},
	}
}

export { createNodeRuntime }
