// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/backend/api
// Named tinyjs RPC methods. The browser receives only the filesystem adapter
// methods it needs; filesystem and process primitives stay in this backend.

import { createDesktopFs, normalizePath } from "./fs.js"

const OUTPUT_LIMIT = 32 * 1024
const decoder = new TextDecoder()

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

function createDesktopBackend({ runtime } = {}) {
	if (!runtime) throw new TypeError("txiki.js runtime is required")
	let filesystem = null
	let pendingOpenFiles = []
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
		fsReadTextHead: ({ path, maxBytes }) => fs().readTextHead(path, maxBytes),
		fsDu: ({ path }) => fs().du(path),
		fsDisk: ({ path }) => fs().disk(path),
		fsCopy: ({ from, to }) => fs().copy(from, to),
		fsMove: ({ from, to }) => fs().move(from, to),
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
