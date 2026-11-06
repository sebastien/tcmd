// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/backend/api
// Named tinyjs RPC methods. The browser receives only the filesystem adapter
// methods it needs; filesystem and process primitives stay in this backend.

import { encodeBase64 } from "../../core/base64.js"
import { createDesktopFs, normalizePath } from "./fs.js"

const OUTPUT_LIMIT = 32 * 1024
// Captured commands (VCS status) need more headroom than the alert preview:
// a large working copy can list thousands of paths. Beyond this the command is
// treated as failed rather than parsed from a truncated listing.
const CAPTURE_LIMIT = 4 * 1024 * 1024
const decoder = new TextDecoder()
const encoder = new TextEncoder()

function requirePath(value, base) {
	return normalizePath(value, base)
}

async function readLimited(stream, limit = OUTPUT_LIMIT) {
	if (!stream) return { text: "", truncated: false }
	const reader = stream.getReader()
	const chunks = []
	let size = 0
	let truncated = false
	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			if (!value?.length) continue
			const remaining = limit - size
			if (remaining > 0) {
				const chunk = value.subarray(0, remaining)
				chunks.push(chunk)
				size += chunk.length
			}
			if (value.length > remaining) truncated = true
		}
	} finally {
		reader.releaseLock?.()
	}
	const bytes = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.length
	}
	return { text: decoder.decode(bytes), truncated }
}

async function writeInput(stream, input) {
	if (!stream) return
	try {
		const writer = stream.getWriter()
		// txiki.js only delivers the first write; send the whole input at once.
		await writer.write(encoder.encode(`${input}`))
		await writer.close()
	} catch (error) {
		// The child may exit before reading stdin; its output still counts.
	}
}

function createDesktopBackend({ runtime } = {}) {
	if (!runtime) throw new TypeError("txiki.js runtime is required")
	let filesystem = null
	let pendingOpenFiles = []
	// Native directory watchers, keyed by window and the frontend's watcher id.
	// The main window owns the whole workspace; a page reload resets its set
	// (`fsWatchReset`) so old watchers never outlive the page that asked.
	const watchers = new Map()
	const watchKey = (meta, id) => `${meta?.window ?? "main"}\u0000${id}`
	const watchId = (id) => {
		if (typeof id !== "string" || !id) throw new TypeError("watch id must be a non-empty string")
		return id
	}
	const fs = () => (filesystem ??= createDesktopFs({ runtime }))
	const fsInfo = () => ({
		home: fs().home(),
		cwd: fs().cwd(),
		root: fs().root(),
		host: runtime.hostName ?? "",
		platform: runtime.env?.OS === "Windows_NT" ? "windows" : "posix",
	})

	const api = {
		fsInfo,
		fsReadDir: ({ path }) => fs().readDir(path),
		fsStat: ({ path }) => fs().stat(path),
		fsRealpath: ({ path }) => fs().realpath(path),
		// Directory watching: the frontend keeps a watcher id per pane and
		// receives `fs-change` pushes over one shared channel.
		fsWatch: ({ path, id }, app, meta) => {
			const key = watchKey(meta, watchId(id))
			watchers.get(key)?.close()
			const watcher = runtime.watch(requirePath(path, runtime.cwd), () => app.push("fs-change", { id }))
			watchers.set(key, watcher)
			return true
		},
		fsUnwatch: ({ id }, _app, meta) => {
			const key = watchKey(meta, watchId(id))
			watchers.get(key)?.close()
			watchers.delete(key)
			return true
		},
		fsWatchReset: (_params, _app, meta) => {
			const prefix = watchKey(meta, "")
			for (const [key, watcher] of watchers) {
				if (!key.startsWith(prefix)) continue
				watcher.close()
				watchers.delete(key)
			}
			return true
		},
		fsReadTextHead: ({ path, maxBytes }) => fs().readTextHead(path, maxBytes),
		fsReadBytes: async ({ path, maxBytes }) => ({
			base64: encodeBase64(await fs().readBytes(path, maxBytes)),
		}),
		fsDu: ({ path }) => fs().du(path),
		fsDisk: ({ path }) => fs().disk(path),
		fsCopy: ({ from, to }) => fs().copy(from, to),
		fsMove: ({ from, to }) => fs().move(from, to),
		fsHardlink: ({ from, to }) => fs().hardlink(from, to),
		fsSymlink: ({ target, link }) => fs().symlink(target, link),
		fsChmod: ({ path, mode }) => fs().chmod(path, mode),
		fsChown: ({ path, owner }) => fs().chown(path, owner),
		fsUnlink: ({ path }) => fs().unlink(path),
		fsTrash: ({ paths }) => fs().trash(paths),
		fsTrashList: () => fs().trashList(),
		fsRestore: ({ paths }) => fs().restore(paths),
		fsTakeOpenFiles: () => pendingOpenFiles.splice(0),
		fsErase: ({ paths }) => fs().erase(paths),
		fsTouch: ({ path }) => fs().touch(path),
		fsMkdir: ({ path }) => fs().mkdir(path),
		hostOpen: async ({ path }, app) => app.shell.open(requirePath(path, runtime.cwd)),
		hostEdit: async ({ path }, app) => app.shell.open(requirePath(path, runtime.cwd)),
		hostRun: async ({ command, cwd }, app) => {
			if (typeof command !== "string" || !command.trim()) throw new TypeError("command must be non-empty text")
			if (command.length > 65536 || command.includes("\0")) throw new Error("command is too long or contains NUL")
			const directory = requirePath(cwd || fs().cwd(), runtime.cwd)
			const stats = await fs().stat(directory)
			if (!stats?.isDir) throw new Error(`not a directory: ${directory}`)
			const shell = runtime.env?.SHELL || "/bin/sh"
			const child = runtime.spawn([shell, "-c", command], {
				cwd: directory,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			})
			const [stdout, stderr, status] = await Promise.all([
				readLimited(child.stdout),
				readLimited(child.stderr),
				child.wait(),
			])
			return {
				stdout: stdout.text,
				stderr: stderr.text,
				exitCode: status.exit_status,
				signal: status.term_signal,
				truncated: stdout.truncated || stderr.truncated,
			}
		},
		// Non-interactive command with captured output, for the VCS adapter
		// (`core/vcs`). Unlike `hostRun`, it takes an argv array, can feed
		// stdin, and enforces a timeout. Returns null when the command cannot
		// start, times out or overflows `CAPTURE_LIMIT`, so callers treat it as
		// "status unavailable" instead of parsing a partial listing.
		hostCapture: async ({ command, args, cwd, input, timeout = 5000 }) => {
			if (typeof command !== "string" || !command) throw new TypeError("command must be non-empty text")
			const argv = [command, ...(Array.isArray(args) ? args.map((arg) => `${arg}`) : [])]
			if (argv.some((arg) => arg.includes("\0"))) throw new Error("command arguments must not contain NUL")
			const directory = requirePath(cwd || fs().cwd(), runtime.cwd)
			const stats = await fs().stat(directory)
			if (!stats?.isDir) throw new Error(`not a directory: ${directory}`)
			let child
			try {
				child = runtime.spawn(argv, {
					cwd: directory,
					stdin: input === undefined || input === null ? "ignore" : "pipe",
					stdout: "pipe",
					stderr: "pipe",
				})
			} catch (error) {
				return null
			}
			let timedOut = false
			const timer = timeout > 0
				? setTimeout(() => {
						timedOut = true
						try {
							child.kill("SIGKILL")
						} catch (error) {
							// Already gone.
						}
					}, timeout)
				: null
			const tasks = [
				readLimited(child.stdout, CAPTURE_LIMIT),
				readLimited(child.stderr, CAPTURE_LIMIT),
				child.wait(),
			]
			if (input !== undefined && input !== null) tasks.push(writeInput(child.stdin, input))
			try {
				const [stdout, stderr, status] = await Promise.all(tasks)
				if (timedOut || stdout.truncated || stderr.truncated) return null
				return {
					code: status.exit_status ?? (status.term_signal ? 1 : 0),
					stdout: stdout.text,
					stderr: stderr.text,
				}
			} catch (error) {
				return null
			} finally {
				if (timer) clearTimeout(timer)
			}
		},
	}

	return {
		api,
		// tinyjs invokes this for folders passed on the command line, associated
		// folders, and files dropped onto the app. The frontend applies them once
		// its session is ready.
		onOpenFiles(paths, app) {
			if (Array.isArray(paths) && paths.length) {
				pendingOpenFiles.push(...paths.filter((path) => typeof path === "string"))
				app.push("open-files", true)
			}
		},
	}
}

export { createDesktopBackend, readLimited }

// EOF
