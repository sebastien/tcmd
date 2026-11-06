// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-11-06

// Module: tcmd/core/vcs
// Repository detection and per-listing status for the file browser. The core
// stays renderer- and process-free: it receives the filesystem's `stat` and
// the host adapter's `capture` (see core/os), and returns
// `{ root, kind, statuses }`, where `statuses` maps an absolute entry path to
// one of:
//
// - `"added"`: untracked, newly added or copied
// - `"modified"`: changed, renamed or type-changed
// - `"ignored"`: matched an ignore rule
//
// `.jj` wins over `.git` at the same level (a colocated repository). When the
// `jj` binary is missing but the repository also carries `.git`, the git
// status is used instead. Commands run scoped to the listed directory, and a
// short TTL cache plus in-flight dedupe keep several panes in one repository
// from spawning several commands at once.
//
// Ignored entries: git reports them directly (`--ignored=matching`). A jj
// repository falls back to `git check-ignore` when it is colocated, and to
// the complement of `jj file list` otherwise — in that last case only files
// can be recognized, since jj exposes no per-directory ignore query.

import { join, normalize, parent, relative } from "./path.js"

// Constant: ADDED / MODIFIED / IGNORED
// The status labels the listing renders.
const ADDED = "added"
const MODIFIED = "modified"
const IGNORED = "ignored"

// Constant: JJ_DIFF_TEMPLATE
// A line per changed path, tab-separated: `path\tstatus_char`. The template
// engine expands the escapes, so no path quoting is involved.
const JJ_DIFF_TEMPLATE = 'path ++ "\\t" ++ status_char ++ "\\n"'

// Function: gitStatusOf
// Maps a two-character porcelain code to a status. Untracked (`??`) counts as
// added, ignored (`!!`) as ignored; a deletion has no listing entry to mark.
function gitStatusOf(code) {
	if (code === "??") return ADDED
	if (code === "!!") return IGNORED
	const index = code[0]
	const work = code[1]
	if (index === "A" || index === "C" || work === "A" || work === "C") return ADDED
	if (index === "D" || work === "D") return null
	if ("MRTU".includes(index) || "MRTU".includes(work)) return MODIFIED
	return null
}

// Function: parseGitStatus
// Parses `git status --porcelain=v1 -z` output into a `{ path -> status }`
// map. Records are `XY path`, NUL-terminated; a rename or copy stores the
// original path in the record that follows and is skipped. Git reports
// untracked and ignored directories with a trailing slash; it is stripped so
// the status keys match the listing paths.
function parseGitStatus(text) {
	const fields = `${text ?? ""}`.split("\0")
	const statuses = new Map()
	for (let i = 0; i < fields.length; i++) {
		const record = fields[i]
		if (!record || record.length < 4) continue
		const code = record.slice(0, 2)
		const path = record.slice(3).replace(/\/$/, "")
		if (code[0] === "R" || code[0] === "C") i += 1
		const status = gitStatusOf(code)
		if (status && path) statuses.set(path, status)
	}
	return statuses
}

// Function: parseJjDiff
// Parses `jj diff -T 'path ++ "\t" ++ status_char ++ "\n"'` into a
// `{ path -> status }` map. A deletion has no listing entry to mark, so it is
// dropped; additions and copies count as added, the rest as modified.
function parseJjDiff(text) {
	const statuses = new Map()
	for (const line of `${text ?? ""}`.split("\n")) {
		if (!line) continue
		const tab = line.lastIndexOf("\t")
		if (tab < 0) continue
		const path = line.slice(0, tab)
		const code = line.slice(tab + 1)
		if (!path || code === "D") continue
		statuses.set(path, code === "A" || code === "C" ? ADDED : MODIFIED)
	}
	return statuses
}

// Function: parseNulPaths
// The non-empty NUL-terminated records in `text` (`git check-ignore -z`).
function parseNulPaths(text) {
	return new Set(`${text ?? ""}`.split("\0").filter(Boolean))
}

// Function: parseLines
// The non-empty newline-terminated records in `text` (`jj file list`).
function parseLines(text) {
	return new Set(`${text ?? ""}`.split("\n").filter(Boolean))
}

// Function: absoluteStatuses
// Rewrites repository-relative status keys to absolute paths.
function absoluteStatuses(root, statuses) {
	const absolute = new Map()
	for (const [path, status] of statuses) absolute.set(join(root, path), status)
	return absolute
}

// Constant: CACHE_LIMIT
// Upper bound on cached directory statuses. Entries older than the TTL are
// dropped first; a long browsing session must not accumulate one full status
// map per visited directory forever.
const CACHE_LIMIT = 256

// Function: createVcs
// Builds the VCS adapter, or null when the host cannot probe or spawn (the
// web adapter has no `capture`).
//
// Options:
// - `fs`: filesystem adapter, used only for `stat` while walking up.
// - `os`: host adapter providing `capture(command, args, options)`.
// - `ttl`: how long a directory status stays cached, in milliseconds
//   (default 300; 0 disables the cache but keeps in-flight dedupe).
//
// Example:
// ```javascript
// const vcs = createVcs({ fs, os: createNodeOs() })
// const info = await vcs.statusFor("/repo/src", entries)
// info.statuses.get("/repo/src/main.js") // "modified"
// ```
function createVcs({ fs, os, ttl = 300 } = {}) {
	if (!fs?.stat || typeof os?.capture !== "function") return null
	const cache = new Map()
	const pending = new Map()

	const capture = async (command, args, options) => {
		try {
			return (await os.capture(command, args, options)) ?? null
		} catch (error) {
			return null
		}
	}

	const exists = async (path) => {
		try {
			return Boolean(await fs.stat(path))
		} catch (error) {
			return false
		}
	}

	// Function: locate
	// Walks up from `path` to the first directory carrying `.jj` or `.git`.
	// `git` records whether a `.git` also exists, for the ignored fallback.
	// A `.git` file (worktree, submodule) counts like a directory.
	const locate = async (path) => {
		let dir = normalize(path)
		for (;;) {
			if (await exists(join(dir, ".jj"))) {
				return { root: dir, kind: "jj", git: await exists(join(dir, ".git")) }
			}
			if (await exists(join(dir, ".git"))) return { root: dir, kind: "git", git: true }
			const up = parent(dir)
			if (!up || up === dir) return null
			dir = up
		}
	}

	// Function: gitStatus
	// Repository status scoped to `rel`, including ignored entries. `normal`
	// untracked handling keeps a wholly untracked directory as one entry, so
	// it can be marked added like a file (the trailing slash it carries is
	// stripped by `parseGitStatus`).
	const gitStatus = async (repo, rel) => {
		const args = [
			"-C", repo.root,
			"status",
			"--porcelain=v1",
			"-z",
			"--ignored=matching",
			"--untracked-files=normal",
		]
		if (rel && rel !== ".") args.push("--", `:(literal)${rel}`)
		const result = await capture("git", args, { cwd: repo.root })
		if (!result || result.code !== 0) return null
		return absoluteStatuses(repo.root, parseGitStatus(result.stdout))
	}

	// Function: gitIgnored
	// The entries matched by the ignore rules of the repository (and the
	// user's global excludes), independent of the index, so a colocated jj
	// repository reuses the same rules.
	const gitIgnored = async (repo, entries) => {
		const paths = entries
			.map((entry) => relative(repo.root, entry.path))
			.filter((path) => path && path !== ".")
		if (!paths.length) return new Set()
		const input = paths.map((path) => `${path}\0`).join("")
		const result = await capture(
			"git",
			["-C", repo.root, "check-ignore", "--no-index", "-z", "--stdin"],
			{ cwd: repo.root, input },
		)
		if (!result) return null
		// 0 = at least one match, 1 = none; anything else is an error.
		if (result.code !== 0 && result.code !== 1) return null
		const ignored = new Set()
		for (const path of parseNulPaths(result.stdout)) ignored.add(join(repo.root, path))
		return ignored
	}

	// Function: jjDiff
	// Working-copy changes for `rel` (the command snapshots first, so edits
	// made through tcmd are visible immediately).
	const jjDiff = async (repo, rel) => {
		const args = [
			"--repository", repo.root,
			"--no-pager",
			"--color=never",
			"diff",
			"-T", JJ_DIFF_TEMPLATE,
		]
		if (rel && rel !== ".") args.push(`root:${JSON.stringify(rel)}`)
		const result = await capture("jj", args, { cwd: repo.root })
		if (!result || result.code !== 0) return null
		return absoluteStatuses(repo.root, parseJjDiff(result.stdout))
	}

	// Function: jjIgnored
	// A pure jj repository has no ignore query: `jj file list` omits ignored
	// files, so any non-directory entry absent from it is ignored. Directories
	// stay unmarked (an empty directory is indistinguishable from an ignored
	// one).
	const jjIgnored = async (repo, rel, entries) => {
		const args = [
			"--repository", repo.root,
			"--no-pager",
			"--color=never",
			"file", "list",
			"--ignore-working-copy",
		]
		if (rel && rel !== ".") args.push(`root:${JSON.stringify(rel)}`)
		const result = await capture("jj", args, { cwd: repo.root })
		if (!result || result.code !== 0) return null
		const listed = parseLines(result.stdout)
		const ignored = new Set()
		for (const entry of entries) {
			if (entry.isDir) continue
			const path = relative(repo.root, entry.path)
			if (path && path !== "." && !listed.has(path)) ignored.add(entry.path)
		}
		return ignored
	}

	// Function: readStatus
	// The status map for one directory, before caching. A jj diff failure
	// falls back to git when the repository is colocated.
	const readStatus = async (repo, rel, entries) => {
		let statuses = null
		if (repo.kind === "jj") statuses = await jjDiff(repo, rel)
		if (statuses === null && repo.git) statuses = await gitStatus(repo, rel)
		if (!statuses) return null
		const ignored = repo.kind === "jj"
			? repo.git
				? await gitIgnored(repo, entries)
				: await jjIgnored(repo, rel, entries)
			: null
		for (const path of ignored ?? []) statuses.set(path, IGNORED)
		return statuses
	}

	// Function: statusFor
	// `{ root, kind, statuses }` for the directory containing `entries`, or
	// null outside a repository. `statuses` keeps only entries that carry a
	// status, keyed by their absolute path. A failed status command still
	// reports the repository with an empty map: detection and status are
	// separate, so a slow or broken VCS never hides the identity bar's name.
	// Supplementary by design: callers never block the listing on it.
	const statusFor = async (dirPath, entries = []) => {
		const repo = await locate(dirPath)
		if (!repo) return null
		const rel = relative(repo.root, dirPath)
		const key = `${repo.kind}:${repo.root}:${rel}`
		let statuses
		const cached = cache.get(key)
		if (cached && Date.now() - cached.at < ttl) {
			statuses = cached.statuses
		} else {
			let task = pending.get(key)
			if (!task) {
				task = readStatus(repo, rel, entries)
					.then((value) => {
						if (ttl > 0) {
							cache.set(key, { at: Date.now(), statuses: value })
							if (cache.size > CACHE_LIMIT) {
								for (const [cachedKey, entry] of cache) {
									if (cache.size <= CACHE_LIMIT) break
									if (Date.now() - entry.at >= ttl) cache.delete(cachedKey)
								}
							}
							if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
						}
						return value
					})
					.catch(() => null)
					.finally(() => pending.delete(key))
				pending.set(key, task)
			}
			statuses = await task
		}
		if (!statuses) statuses = new Map()
		const relevant = new Map()
		for (const entry of entries) {
			// The repository metadata directories are never statused: a
			// user-level ignore rule often matches `.jj` (and `.git`), but the
			// listing should not flag the repository itself.
			if (entry.name === ".git" || entry.name === ".jj") continue
			const status = statuses.get(entry.path)
			if (status) relevant.set(entry.path, status)
		}
		return { root: repo.root, kind: repo.kind, statuses: relevant }
	}

	return { statusFor }
}

export { ADDED, IGNORED, MODIFIED, createVcs, parseGitStatus, parseJjDiff }

// EOF
