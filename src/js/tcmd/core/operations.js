// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/operations
// The CLI operations: the file-management verbs the command panel runs. An
// operation receives the session and its raw argument tokens; path arguments
// resolve filesets ($A … $FILE), `~` and paths relative to the active pane.
// Operations own their side effects and return a one-line message (shown in
// the command bar) or undefined.
//
// Registry entries carry presentation metadata used by the panel and help:
// `signature`, `description`, `aliases` and an optional `confirmText`. An
// optional `risk` ("caution" for a move, "destructive" for delete/erase) sets
// the operation's color group and tint.
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

import { basename, extname, join, normalize, parent as parentOf } from "./path.js"
import { currentPane, currentPaneId, PANE_BUFFERS } from "./pane.js"

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
			{ name: "FROM", kind: "selection", role: "source", variadic: true },
			{ name: "TO", kind: "dest" },
		],
		async run(session, args) {
			const sources = expandAll(session, [args[0]])
			assertNoOverlappingPaths(sources, "copy")
			const targets = expandAll(session, [args[1]])
			if (targets.length !== 1) throw new Error("copy: TO must be a single path")
			const [target] = targets
			if (sources.length > 1 && !(await isDir(session, target))) {
				throw new Error("copy: TO must be an existing directory for multiple FROM")
			}
			const into = await isDir(session, target)
			const copies = []
			for (const source of sources) {
				if (!(await session.fs.stat(source))) throw new Error(`not found: ${source}`)
				const destination = into ? join(target, basename(source)) : target
				const existed = Boolean(await session.fs.stat(destination))
				await session.fs.copy(source, destination)
				copies.push({ from: source, to: destination, existed })
			}
			await refreshPanes(session)
			// Undo removes what was copied, but only when nothing pre-existed:
			// erasing a target that was merged into would drop earlier content.
			if (copies.every((copy) => !copy.existed)) {
				let snapshots = await Promise.all(copies.map((copy) => pathSnapshot(session.fs, copy.to)))
				if (snapshots.some((snapshot) => snapshot === null)) throw new Error("copy target disappeared")
				recordHistory(session, {
					label: `copy ${sources.length} path${sources.length === 1 ? "" : "s"} → ${target}`,
					undo: async () => {
						for (let i = 0; i < copies.length; i++) {
							if (JSON.stringify(await pathSnapshot(session.fs, copies[i].to)) !== JSON.stringify(snapshots[i])) {
								throw new Error(`copy target changed: ${copies[i].to}`)
							}
						}
						await session.fs.erase(copies.map((copy) => copy.to))
					},
					redo: async () => {
						await assertPathsAbsent(session.fs, copies.map((copy) => copy.to))
						for (const copy of copies) await session.fs.copy(copy.from, copy.to)
						snapshots = await Promise.all(copies.map((copy) => pathSnapshot(session.fs, copy.to)))
					},
				})
			}
			return `copied ${sources.length} path${sources.length === 1 ? "" : "s"} to ${target}`
		},
	},
	{
		name: "mkdir",
		signature: "mkdir PATH...",
		description: "Create directories",
		arity: { min: 1 },
		args: [{ name: "PATH", kind: "literal", variadic: true }],
		async run(session, args) {
			const paths = expandAll(session, args)
			const requested = new Set()
			const created = new Set()
			for (const path of paths) {
				const normalized = normalize(path)
				if (requested.has(normalized)) throw new Error(`duplicate path: ${normalized}`)
				requested.add(normalized)
				if (await pathExists(session.fs, normalized)) throw new Error(`already exists: ${normalized}`)
				let current = normalized
				while (current !== "/") {
					const stats = await session.fs.stat(current)
					if (stats) {
						if (!stats.isDir) throw new Error(`not a directory: ${current}`)
						break
					}
					created.add(current)
					const parent = parentOf(current)
					if (!parent || parent === current) break
					current = parent
				}
			}
			const createdPaths = [...created]
			try {
				for (const path of paths) await session.fs.mkdir(path)
			} catch (error) {
				await removeCreatedDirs(session.fs, createdPaths)
				throw error
			}
			await refreshPanes(session)
			recordHistory(session, {
				label: `mkdir ${paths.map((path) => basename(path)).join(", ")}`,
				undo: async () => {
					await removeCreatedDirs(session.fs, createdPaths)
				},
				redo: async () => {
					await assertPathsAbsent(session.fs, createdPaths)
					for (const path of paths) await session.fs.mkdir(path)
				},
			})
			return `created ${createdPaths.length} director${createdPaths.length === 1 ? "y" : "ies"}`
		},
	},
	{
		name: "move",
		signature: "move FROM TO",
		description: "Move files and directories",
		risk: "caution",
		arity: { min: 2, max: 2 },
		args: [
			{ name: "FROM", kind: "selection", role: "source", variadic: true },
			{ name: "TO", kind: "dest" },
		],
		async run(session, args) {
			const sources = expandAll(session, [args[0]])
			assertNoOverlappingPaths(sources, "move")
			const targets = expandAll(session, [args[1]])
			if (targets.length !== 1) throw new Error("move: TO must be a single path")
			const [target] = targets
			if (sources.length > 1 && !(await isDir(session, target))) {
				throw new Error("move: TO must be an existing directory for multiple FROM")
			}
			const into = await isDir(session, target)
			const plan = sources.map((source) => ({
				from: source,
				to: into ? join(target, basename(source)) : target,
			}))
			for (const move of plan) {
				if (!(await pathExists(session.fs, move.from))) throw new Error(`not found: ${move.from}`)
			}
			await assertPathsAbsent(session.fs, plan.map((move) => move.to))
			const moves = []
			for (const move of plan) {
				await session.fs.move(move.from, move.to)
				moves.push(move)
			}
			await refreshPanes(session)
			recordHistory(session, {
				label: `move ${sources.length} path${sources.length === 1 ? "" : "s"} → ${target}`,
				undo: async () => {
					await moveHistory(session, moves.map(({ from, to }) => ({ from: to, to: from })))
				},
				redo: async () => {
					await moveHistory(session, moves)
				},
			})
			return `moved ${sources.length} path${sources.length === 1 ? "" : "s"} to ${target}`
		},
	},
	{
		name: "rename",
		signature: "rename FROM TO PATH",
		description: "Rename a child path from one name to another",
		risk: "caution",
		arity: { min: 3, max: 3 },
		args: [
			{ name: "FROM", kind: "literal" },
			{ name: "TO", kind: "literal" },
			{ name: "PATH", kind: "path", mode: "dir" },
		],
		async run(session, args) {
			const fromName = `${args[0] ?? ""}`
			const toName = `${args[1] ?? ""}`
			if (!fromName) throw new Error("rename needs FROM")
			if (!toName) throw new Error("rename needs TO")
			assertRenameName(fromName, "FROM")
			assertRenameName(toName, "TO")
			const paths = expandAll(session, [args[2]])
			if (paths.length !== 1) throw new Error("rename: PATH must be a single directory")
			const [directory] = paths
			if (!(await isDir(session, directory))) throw new Error(`rename: PATH is not a directory: ${directory}`)
			const move = { from: join(directory, fromName), to: join(directory, toName) }
			if (move.from === move.to) return "rename: nothing changed"
			if (!(await pathExists(session.fs, move.from))) throw new Error(`rename: not found: ${move.from}`)
			await assertPathsAbsent(session.fs, [move.to])
			await session.fs.move(move.from, move.to)
			await refreshPanes(session)
			recordHistory(session, {
				label: `rename ${fromName} → ${toName}`,
				undo: async () => {
					await moveHistory(session, [{ from: move.to, to: move.from }])
				},
				redo: async () => {
					await moveHistory(session, [move])
				},
			})
			return `renamed ${fromName} to ${toName}`
		},
	},
	{
		name: "replace",
		signature: "replace FIND REPLACE PATH...",
		description: "Replace a literal substring in path names",
		risk: "caution",
		arity: { min: 3 },
		args: [
			{ name: "FIND", kind: "literal" },
			{ name: "REPLACE", kind: "literal" },
			{ name: "PATH", kind: "selection", role: "active", variadic: true },
		],
		// The live mapping the panel previews instead of the command line: one
		// `old → new` line per path, an unchanged path marked as such, and an
		// invalid name or a duplicate target flagged before anything runs.
		preview(session, argv) {
			const [find, replace] = argv
			if (!find || !replace) return null
			let paths
			try {
				paths = expandAll(session, argv.slice(2))
			} catch (error) {
				return null
			}
			if (!paths.length) return null
			const plan = replacePlan(find, replace, paths)
			const lines = plan.map((row) => {
				if (row.error) return `${row.name} → ⚠ ${row.error}`
				if (!row.changed) return `${row.name}  (unchanged)`
				return `${row.name} → ${row.newName}`
			})
			for (const name of duplicateTargets(plan)) lines.push(`⚠ duplicate target: ${name}`)
			return lines.join("\n")
		},
		async run(session, args) {
			const find = `${args[0] ?? ""}`
			const replace = `${args[1] ?? ""}`
			if (!find) throw new Error("replace needs FIND")
			if (!replace) throw new Error("replace needs REPLACE")
			const paths = expandAll(session, args.slice(2))
			if (!paths.length) throw new Error("replace needs at least one path")
			assertNoOverlappingPaths(paths, "replace")
			const plan = replacePlan(find, replace, paths)
			const bad = plan.find((row) => row.error)
			if (bad) throw new Error(`replace ${basename(bad.path)}: ${bad.error}`)
			const duplicates = duplicateTargets(plan)
			if (duplicates.length) throw new Error(`replace: duplicate target ${duplicates[0]}`)
			const replaceMoves = plan
				.filter((row) => row.changed)
				.map((row) => ({ from: row.path, to: join(parentOf(row.path), row.newName) }))
			for (const move of replaceMoves) {
				if (!(await pathExists(session.fs, move.from))) throw new Error(`replace: not found: ${move.from}`)
			}
			await assertPathsAbsent(session.fs, replaceMoves.map((move) => move.to))
			let count = 0
			const moves = []
			for (const move of replaceMoves) {
				await session.fs.move(move.from, move.to)
				moves.push(move)
				count += 1
			}
			await refreshPanes(session)
			if (!count) return "replace: nothing changed"
			recordHistory(session, {
				label: `replace ${count} path${count === 1 ? "" : "s"}`,
				undo: async () => {
					await moveHistory(session, moves.map(({ from, to }) => ({ from: to, to: from })))
				},
				redo: async () => {
					await moveHistory(session, moves)
				},
			})
			return `replaced ${count} path${count === 1 ? "" : "s"}`
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
			assertNoOverlappingPaths(paths, "delete")
			for (const path of paths) {
				if (!(await session.fs.stat(path))) throw new Error(`not found: ${path}`)
			}
			const trashed = (await session.fs.trash(paths)) ?? []
			await refreshPanes(session)
			// The trash copies the delete can be undone from. Mutable because a
			// redo re-trashes under fresh names.
			let items = trashed.map((entry) => entry?.to ?? entry).filter(Boolean)
			let restoredSnapshots = null
			if (items.length) {
				recordHistory(session, {
					label: `trash ${paths.length} path${paths.length === 1 ? "" : "s"}`,
					undo: async () => {
						await session.fs.restore(items)
						restoredSnapshots = await Promise.all(paths.map((path) => pathSnapshot(session.fs, path)))
					},
					redo: async () => {
						for (let i = 0; i < paths.length; i++) {
							if (JSON.stringify(await pathSnapshot(session.fs, paths[i])) !== JSON.stringify(restoredSnapshots?.[i])) {
								throw new Error(`path changed since restore: ${paths[i]}`)
							}
						}
						const again = (await session.fs.trash(paths)) ?? []
						items = again.map((entry) => entry?.to ?? entry).filter(Boolean)
					},
				})
			}
			// Name where the entries went (the trash directory), so the delete is
			// not a black hole: `u` history or `⇧T` trash bring them back.
			const where = items.length ? parentOf(items[0]) : null
			const count = `path${paths.length === 1 ? "" : "s"}`
			return where ? `trashed ${paths.length} ${count} to ${where}` : `trashed ${paths.length} ${count}`
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
			assertNoOverlappingPaths(paths, "erase")
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
			const results = []
			for (const path of paths) {
				const stats = await session.fs.stat(path)
				if (!stats) throw new Error(`not found: ${path}`)
				const size = stats.isDir ? await session.fs.du(path) : stats.size
				const summary = `${stats.isDir ? "directory" : "file"} · ${humanSize(size)} · ${new Date(stats.mtimeMs || 0).toISOString()}`
				details.push(path)
				details.push(`  ${summary}`)
				results.push(`${path} · ${summary}`)
			}
			session.showPreview.set(true)
			session.previewTarget.set(await previewTarget(session, paths[0], details))
			return results.join("; ")
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
			const label = buffer ? `${buffer}`.toUpperCase() : PANE_BUFFERS[currentPaneId(session)] ?? PANE_BUFFERS.left
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
			const cwd = currentPane(session).path.value
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
	const base = currentPane(session).path.value ?? session.fs.cwd()
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
	// Every rendered column: the two panes, plus the explorer's parent mirror
	// and the directory the inspector is showing.
	await Promise.all(Object.values(session.panes).map((pane) => pane.refresh()))
}

// Function: recordHistory
// Journals a reversible operation when the session has a journal (headless
// hosts and tests may omit it). `entry` is `{ label, undo, redo }`.
function recordHistory(session, entry) {
	session.journal?.record?.(entry)
}

async function pathExists(fs, path) {
	if (await fs.stat(path)) return true
	const parent = parentOf(path)
	if (!parent) return false
	try {
		return (await fs.readDir(parent)).some((entry) => entry.name === basename(path))
	} catch (error) {
		if (error?.code === "ENOENT" || error?.name === "NotFoundError" || error?.name === "TypeMismatchError") return false
		throw error
	}
}

async function assertPathsAbsent(fs, paths) {
	const seen = new Set()
	for (const path of paths) {
		if (seen.has(path) || (await pathExists(fs, path))) {
			const error = new Error(`destination already exists: ${path}`)
			error.code = "EEXIST"
			throw error
		}
		seen.add(path)
	}
}

function assertNoOverlappingPaths(paths, operation) {
	for (let i = 0; i < paths.length; i++) {
		for (let j = i + 1; j < paths.length; j++) {
			const a = paths[i]
			const b = paths[j]
			if (a === b || isAncestorPath(a, b) || isAncestorPath(b, a)) {
				throw new Error(`${operation}: overlapping paths: ${a} and ${b}`)
			}
		}
	}
}

function isAncestorPath(parent, child) {
	return child.startsWith(parent === "/" ? "/" : `${parent}/`)
}

async function moveHistory(session, moves) {
	await assertPathsAbsent(session.fs, moves.map((move) => move.to))
	for (const move of moves) await session.fs.move(move.from, move.to)
}

async function removeCreatedDirs(fs, paths) {
	const existing = []
	for (const path of paths) if (await pathExists(fs, path)) existing.push(path)
	const existingSet = new Set(existing)
	for (const path of existing) {
		const expected = new Set(existing.filter((child) => parentOf(child) === path).map(basename))
		const actual = new Set((await fs.readDir(path)).map((entry) => entry.name))
		if (actual.size !== expected.size || [...actual].some((name) => !expected.has(name))) {
			throw new Error(`directory changed since mkdir: ${path}`)
		}
	}
	const deepestFirst = [...existingSet].sort((a, b) => b.split("/").length - a.split("/").length)
	for (const path of deepestFirst) await fs.erase([path])
}

async function treeSnapshot(fs, path, entry = null) {
	const stats = await fs.stat(path)
	if (!stats) return null
	const isSymlink = Boolean(entry?.isSymlink || stats.isSymlink)
	const snapshot = {
		isDir: Boolean(stats.isDir),
		isSymlink,
		size: stats.size ?? 0,
		mtimeMs: stats.mtimeMs ?? 0,
		ctimeMs: stats.ctimeMs ?? 0,
		mode: stats.mode ?? 0,
		target: isSymlink ? entry?.target ?? null : null,
	}
	if (snapshot.isDir && !isSymlink) {
		const children = (await fs.readDir(path)).sort((a, b) => a.name.localeCompare(b.name))
		snapshot.children = await Promise.all(children.map((child) => treeSnapshot(fs, child.path, child)))
	}
	return snapshot
}

async function pathSnapshot(fs, path) {
	const parent = parentOf(path)
	const entry = parent ? (await fs.readDir(parent)).find((candidate) => candidate.name === basename(path)) : null
	return treeSnapshot(fs, path, entry)
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
	const active = currentPane(session)
	if (!name) return active
	const target = `${name}`.toUpperCase()
	for (const paneId of Object.keys(session.panes)) {
		if (PANE_BUFFERS[paneId] === target) return session.panes[paneId]
	}
	throw new Error(`unknown selection buffer: ${name}`)
}

// Function: replacePlan
// The literal find-and-replace mapping a `replace` runs: one row per path with
// its source basename, its new basename (every occurrence of FIND replaced by
// REPLACE), whether it changed, and an error when the result is empty or
// contains a path separator. Pure, so the panel preview and the run agree.
function replacePlan(find, replace, paths) {
	return (paths ?? []).map((path) => {
		const name = basename(path)
		const newName = name.split(find).join(replace)
		let error = null
		if (!newName) error = "empty name"
		else if (newName.includes("/")) error = "name has a slash"
		return { path, name, newName, changed: error === null && newName !== name, error }
	})
}

function assertRenameName(name, argument) {
	if (name === "." || name === ".." || name.includes("/") || name.includes("\0")) {
		throw new Error(`rename: ${argument} must be a single name`)
	}
}

// Function: duplicateTargets
// The destination paths two or more changed paths would collide on. Basenames
// may repeat safely when their files live in different directories.
function duplicateTargets(plan) {
	const seen = new Set()
	const duplicates = new Set()
	for (const row of plan ?? []) {
		if (!row.changed) continue
		const target = join(parentOf(row.path), row.newName)
		if (seen.has(target)) duplicates.add(target)
		seen.add(target)
	}
	return [...duplicates]
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
	recordHistory,
	refreshPanes,
	replacePlan,
	runOperation,
}

// EOF
