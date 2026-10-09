// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/operations
// The scripting operations: the file-management verbs the command palette's
// scripting mode completes and runs. An operation receives the session and
// its raw argument tokens; path arguments resolve filesets ($A … $FILE), `~`
// and paths relative to the active pane. Operations own their side effects and
// return a one-line message (shown in the command bar) or undefined.
//
// Registry entries carry the presentation metadata the palette renders:
// `signature`, `description`, `aliases` and an optional `confirmText`. An
// optional `risk` ("caution" for a move, "destructive" for delete/erase) lets
// the command panel tint the operation by how dangerous it is.
//
// They also carry `args`, the structured signature the command panel renders:
// one descriptor per positional argument. A descriptor is
// `{ name, kind, role?, optional?, variadic? }` where `kind` is:
// - "selection": one or more paths from a pane's selection (marks, falling
//   back to the cursor entry). `role` picks the pane: "source" (SRC), "dest"
//   (DST) or "active" (default).
// - "dest": a single destination directory (the DST pane's path).
// - "buffer": a selection-buffer label (`+A`, `-B`, …).
// - "literal": free text (a name), edited in the panel's text field.
// - "raw": the rest of the line, unparsed (a shell command).

import { basename, extname, join, normalize } from "./path.js"
import { PANE_BUFFERS } from "./pane.js"

// Constant: PATHS_PREFIX
// The prefix of a self-contained path-list token the command panel encodes
// (`$paths:["/a","/b"]`), which `expandArg` decodes back to paths. It keeps a
// panel argument self-contained (no session state), so it still resolves after
// an async confirm re-runs it.
const PATHS_PREFIX = "$paths:"

// Function: pathToken
// Encodes a resolved path list as one `$paths:` token.
function pathToken(paths) {
	return `${PATHS_PREFIX}${JSON.stringify(paths ?? [])}`
}

// Function: decodePathToken
// Decodes a `$paths:` token to normalized paths, or null when `text` is not one
// (so `expandArg` can fall through to the named filesets).
function decodePathToken(text) {
	if (!`${text ?? ""}`.startsWith(PATHS_PREFIX)) return null
	try {
		const parsed = JSON.parse(`${text}`.slice(PATHS_PREFIX.length))
		return Array.isArray(parsed) ? parsed.map((path) => normalize(`${path}`)) : []
	} catch (error) {
		return []
	}
}

const operations = [
	{
		name: "copy",
		signature: "copy FROM TO",
		description: "Copy files and directories",
		arity: { min: 2, max: 2 },
		args: [
			{ name: "FROM", kind: "selection", role: "source" },
			{ name: "TO", kind: "dest" },
		],
		async run(session, args) {
			const sources = expandAll(session, [args[0]])
			const targets = expandAll(session, [args[1]])
			if (targets.length !== 1) throw new Error("copy: TO must be a single path")
			const [target] = targets
			if (sources.length > 1 && !(await isDir(session, target))) {
				throw new Error("copy: TO must be an existing directory for multiple FROM")
			}
			const into = await isDir(session, target)
			for (const source of sources) {
				if (!(await session.fs.stat(source))) throw new Error(`not found: ${source}`)
				await session.fs.copy(source, into ? join(target, basename(source)) : target)
			}
			await refreshPanes(session)
			return `copied ${sources.length} path${sources.length === 1 ? "" : "s"} to ${target}`
		},
	},
	{
		name: "move",
		signature: "move FROM TO",
		description: "Move files and directories",
		risk: "caution",
		arity: { min: 2, max: 2 },
		args: [
			{ name: "FROM", kind: "selection", role: "source" },
			{ name: "TO", kind: "dest" },
		],
		async run(session, args) {
			const sources = expandAll(session, [args[0]])
			const targets = expandAll(session, [args[1]])
			if (targets.length !== 1) throw new Error("move: TO must be a single path")
			const [target] = targets
			if (sources.length > 1 && !(await isDir(session, target))) {
				throw new Error("move: TO must be an existing directory for multiple FROM")
			}
			const into = await isDir(session, target)
			for (const source of sources) {
				if (!(await session.fs.stat(source))) throw new Error(`not found: ${source}`)
				await session.fs.move(source, into ? join(target, basename(source)) : target)
			}
			await refreshPanes(session)
			return `moved ${sources.length} path${sources.length === 1 ? "" : "s"} to ${target}`
		},
	},
	{
		name: "delete",
		signature: "delete PATH...",
		description: "Delete paths, moving them to the trash",
		risk: "destructive",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active", variadic: true }],
		async run(session, args) {
			const paths = expandAll(session, args)
			for (const path of paths) {
				if (!(await session.fs.stat(path))) throw new Error(`not found: ${path}`)
			}
			await session.fs.trash(paths)
			await refreshPanes(session)
			return `trashed ${paths.length} path${paths.length === 1 ? "" : "s"}`
		},
	},
	{
		name: "erase",
		signature: "erase PATH...",
		description: "Delete paths without moving them to the trash",
		risk: "destructive",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active", variadic: true }],
		confirmText: (args) => `erase ${args.join(" ")} without trash?`,
		async run(session, args) {
			const paths = expandAll(session, args)
			await session.fs.erase(paths)
			await refreshPanes(session)
			return `erased ${paths.length} path${paths.length === 1 ? "" : "s"}`
		},
	},
	{
		name: "stat",
		signature: "stat PATH...",
		description: "Show file information, including disk usage",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active", variadic: true }],
		async run(session, args) {
			const paths = expandAll(session, args)
			const details = []
			for (const path of paths) {
				const stats = await session.fs.stat(path)
				if (!stats) throw new Error(`not found: ${path}`)
				const size = stats.isDir ? await session.fs.du(path) : stats.size
				details.push(path)
				details.push(
					`  ${stats.isDir ? "directory" : "file"} · ${humanSize(size)} · ${new Date(stats.mtimeMs || 0).toISOString()}`,
				)
			}
			session.showPreview.set(true)
			session.previewTarget.set(await previewTarget(session, paths[0], details))
			return `stat ${paths.join(" ")}`
		},
	},
	{
		name: "touch",
		signature: "touch PATH...",
		description: "Create files or bump their modification time",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active", variadic: true }],
		async run(session, args) {
			const paths = expandAll(session, args)
			for (const path of paths) await session.fs.touch(path)
			await refreshPanes(session)
			return `touched ${paths.length} path${paths.length === 1 ? "" : "s"}`
		},
	},
	{
		name: "sel",
		signature: "sel [+|-][BUF] PATH...",
		description: "Add or remove paths from a selection buffer",
		arity: { min: 1 },
		args: [
			{ name: "BUF", kind: "buffer", optional: true },
			{ name: "PATH", kind: "selection", role: "active", variadic: true },
		],
		async run(session, args) {
			const { sign, buffer, tokens } = parseSelection(args)
			if (!tokens.length) throw new Error("sel needs at least one path")
			const paths = expandAll(session, tokens)
			const target = findBuffer(session, buffer)
			const label = buffer ? `${buffer}`.toUpperCase() : PANE_BUFFERS[session.active.value] ?? PANE_BUFFERS.left
			const marks = new Set(target.marked.value)
			for (const path of paths) {
				if (sign === "-") marks.delete(path)
				else marks.add(path)
			}
			target.marked.set(marks)
			const verb = sign === "-" ? "removed" : "added"
			const to = sign === "-" ? "from" : "to"
			return `${verb} ${paths.length} path${paths.length === 1 ? "" : "s"} ${to} $${label}`
		},
	},
	{
		name: "edit",
		signature: "edit PATH",
		description: "Edit a file with $EDITOR",
		arity: { min: 1, max: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active" }],
		async run(session, args) {
			const paths = expandAll(session, args)
			if (paths.length !== 1) throw new Error("edit expects a single path")
			const [path] = paths
			await session.os.edit(path)
			await refreshPanes(session)
			return `edited ${path}`
		},
	},
	{
		name: "view",
		signature: "view PATH",
		description: "Preview a path",
		arity: { min: 1, max: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active" }],
		async run(session, args) {
			const paths = expandAll(session, args)
			if (paths.length !== 1) throw new Error("view expects a single path")
			const [path] = paths
			session.showPreview.set(true)
			session.previewTarget.set(await previewTarget(session, path))
			return `viewing ${path}`
		},
	},
	{
		name: "open",
		signature: "open PATH...",
		description: "Open paths with the desktop opener",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "selection", role: "active", variadic: true }],
		async run(session, args) {
			const paths = expandAll(session, args)
			for (const path of paths) await session.os.open(path)
			return `opened ${paths.length} path${paths.length === 1 ? "" : "s"}`
		},
	},
	{
		name: "bookmark",
		signature: "bookmark [NAME] [PATH]",
		description: "List, add or remove named bookmarks",
		arity: { min: 0, max: 2 },
		args: [
			{ name: "NAME", kind: "literal", optional: true },
			{ name: "PATH", kind: "selection", role: "active", optional: true },
		],
		async run(session, args) {
			const bookmarks = session.bookmarks
			if (args.length === 0) {
				const rows = bookmarks.rows()
				if (!rows.length) return "no bookmarks"
				return `bookmarks:\n${rows
					.map((row) => `  ${row.name}  ${row.path}${row.isDir === true ? "/" : ""}`)
					.join("\n")}`
			}
			const [name, path] = args
			if (!path) {
				if (!(await bookmarks.remove(name))) throw new Error(`no such bookmark: ${name}`)
				return `removed bookmark ${name}`
			}
			const target = expandArg(session, path)
			if (target.length !== 1) throw new Error("bookmark: PATH must be a single path")
			const stats = await session.fs.stat(target[0])
			await bookmarks.record(name, target[0], stats ? Boolean(stats.isDir) : null)
			return `bookmarked ${name} → ${target[0]}`
		},
	},
	{
		name: "run",
		signature: "run CMD",
		aliases: ["!"],
		description: "Run a shell command in the active pane",
		raw: true,
		arity: { min: 1 },
		args: [{ name: "CMD", kind: "raw" }],
		async run(session, args) {
			const command = `${args[0] ?? ""}`.trim()
			if (!command) throw new Error("run needs a command")
			const cwd = session.panes[session.active.value]?.path.value
			await session.os.run(command, { cwd })
			await refreshPanes(session)
			return `ran ${command}`
		},
	},
]

// Function: getOperations
// The full operation registry.
function getOperations() {
	return operations
}

// Function: getOperation
// Looks up an operation by name or alias (case-insensitive).
function getOperation(name) {
	const needle = `${name ?? ""}`.toLowerCase()
	for (const operation of operations) {
		if (operation.name === needle) return operation
		if ((operation.aliases ?? []).some((alias) => alias.toLowerCase() === needle)) return operation
	}
	return null
}

// Function: runOperation
// Runs an operation directly with already-split argument tokens, shared by the
// script line runner and the command panel. `options.confirmed` skips the
// confirm prompt. Writes the result (or the failure) to the session notice and
// returns the status: "ran", "confirm", "empty" or "error". Delegated to by
// `runLine`; the panel passes `options.op` + `options.args` so `confirm.yes`
// can re-run without re-parsing a line.
async function runOperation(session, op, args, options = {}) {
	const clean = (args ?? []).filter((arg) => `${arg ?? ""}` !== "")
	if (op.arity) {
		if (clean.length < op.arity.min || (op.arity.max !== undefined && clean.length > op.arity.max)) {
			session.notice.set({ kind: "error", text: `usage: ${op.signature}` })
			return "error"
		}
	}
	if (op.confirmText && !options.confirmed) {
		session.confirm.set({ text: op.confirmText(clean), line: options.line, op: op.name, args: clean })
		return "confirm"
	}
	try {
		const message = await op.run(session, clean, options)
		if (message) session.notice.set({ kind: "tip", text: message })
		return "ran"
	} catch (error) {
		session.notice.set({ kind: "error", text: `${error?.message ?? error}` })
		return "error"
	}
}

// Function: expandArg
// Expands one argument token to paths: the command panel's self-contained
// `$paths:` lists, filesets ($A, $FILE), `~` and paths relative to the active
// pane.
function expandArg(session, token) {
	const text = `${token ?? ""}`
	if (text.startsWith("$")) {
		const encoded = decodePathToken(text)
		if (encoded) return encoded
		const set = (session.filesets?.value ?? []).find(
			(candidate) => candidate.id.toLowerCase() === text.toLowerCase(),
		)
		if (!set) throw new Error(`unknown fileset: ${text}`)
		return set.paths.slice()
	}
	if (text.startsWith("~")) {
		const rest = text.replace(/^~\/?/, "")
		return [rest ? join(session.fs.home(), rest) : session.fs.home()]
	}
	if (text.startsWith("/")) return [normalize(text)]
	const base = session.panes[session.active.value]?.path.value ?? session.fs.cwd()
	return [join(base, text)]
}

// Function: expandAll
// Expands every token to paths, flattened in order.
function expandAll(session, tokens) {
	const paths = []
	for (const token of tokens) paths.push(...expandArg(session, token))
	return paths
}

async function isDir(session, path) {
	const stats = await session.fs.stat(path)
	return Boolean(stats?.isDir)
}

async function refreshPanes(session) {
	await Promise.all([session.panes.left.refresh(), session.panes.right.refresh()])
}

async function previewTarget(session, path, details) {
	const stats = await session.fs.stat(path)
	if (!stats) throw new Error(`not found: ${path}`)
	const target = {
		path,
		name: basename(path),
		isDir: stats.isDir,
		size: stats.size,
		mtimeMs: stats.mtimeMs,
		ext: extname(path),
	}
	if (details) target.details = details
	return target
}

// Function: parseSelection
// Splits `sel` arguments into a sign, an optional buffer label and the path
// tokens: `+A paths` adds to buffer A (the source pane), `-B paths` removes
// from buffer B (the destination pane); a bare path list defaults to `+` on the
// active pane.
function parseSelection(args) {
	const match = /^([+-])(\w*)$/.exec(args[0] ?? "")
	if (match) {
		return { sign: match[1], buffer: match[2] || null, tokens: args.slice(1) }
	}
	return { sign: "+", buffer: null, tokens: args }
}

// Function: findBuffer
// Resolves a selection buffer to a pane's marks cell: the active pane by
// default, or the pane whose buffer label matches `name` (`A` = source/left,
// `B` = destination/right).
function findBuffer(session, name) {
	const active = session.panes[session.active.value] ?? session.panes.left
	if (!name) return active
	const target = `${name}`.toUpperCase()
	for (const paneId of Object.keys(session.panes)) {
		if (PANE_BUFFERS[paneId] === target) return session.panes[paneId]
	}
	throw new Error(`unknown selection buffer: ${name}`)
}

// Function: humanSize
// Compact byte size for stat output (core-local: components own presentation
// formatting).
function humanSize(bytes) {
	const value = Number(bytes ?? 0)
	if (value < 1024) return `${value}B`
	const units = ["K", "M", "G", "T"]
	let size = value / 1024
	let unit = 0
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024
		unit++
	}
	return `${size >= 100 ? Math.round(size) : size.toFixed(1)}${units[unit]}`
}

export {
	expandAll,
	expandArg,
	decodePathToken,
	getOperation,
	getOperations,
	humanSize,
	pathToken,
	runOperation,
}

// EOF
