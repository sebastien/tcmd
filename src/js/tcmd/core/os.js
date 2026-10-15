// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/os
// Host adapter for the operations that leave the model: opening a path with
// the desktop opener, editing a file with $EDITOR, and running a shell
// command. Like `core/fs`, the adapter is injected into the session so the
// web build can provide a null implementation and tests a fake.
//
// A host adapter provides:
// - `open(path)`: Promise<void> - desktop open (xdg-open / open)
// - `edit(path)`: Promise<void> - $EDITOR (or vi)
// - `run(command, options)`: Promise<void> - `$SHELL -c command` in
//   `options.cwd`
// - `canEdit`: boolean - whether `edit` can launch an editor at all. A host
//   without one (the web's null adapter) sets it false, so Enter on a file
//   falls back to the fullscreen inspector instead of erroring (see
//   `core/commands#pane.enter`).

// `node:child_process` is imported lazily: only `createNodeOs` needs it, so
// bundles that use the null adapter (the web view, tests) never pull in a Node
// builtin. See `loadChildProcess`.
let childProcess = null

// Function: loadChildProcess
// Resolves the `node:child_process` module once, on first use.
function loadChildProcess() {
	childProcess ??= import("node:child_process")
	return childProcess
}

// Function: createNodeOs
// Node/Bun-backed host adapter. `suspend`/`resume` are optional hooks the TUI
// uses to release and restore the terminal around interactive commands.
function createNodeOs({ suspend, resume } = {}) {
	return {
		canEdit: true,
		async open(path) {
			await openWith(path, openerCandidates())
		},
		async edit(path) {
			await withSuspended(suspend, resume, () =>
				runCommand(editorCommand(), [path], {}),
			)
		},
		async run(command, options = {}) {
			await withSuspended(suspend, resume, () =>
				runCommand(shellCommand(), ["-c", command], { cwd: options.cwd }),
			)
		},
	}
}

// Function: createNullOs
// Host adapter for environments without a shell (web): every operation fails
// with a clear message, which the dispatch path reports in the command bar.
function createNullOs() {
	const unsupported = (name) => async () => {
		throw new Error(`${name} is not available in this environment`)
	}
	return {
		canEdit: false,
		open: unsupported("open"),
		edit: unsupported("edit"),
		run: unsupported("run"),
	}
}

// Function: openerCandidates
// Desktop openers in preference order: $TCMD_OPENER, then `open` on macOS and
// `gnome-open`/`xdg-open` on Linux. Missing commands fall through to the next
// candidate.
function openerCandidates() {
	if (process.env.TCMD_OPENER) return [process.env.TCMD_OPENER]
	return process.platform === "darwin" ? ["open"] : ["gnome-open", "xdg-open"]
}

async function openWith(path, candidates) {
	let lastError
	for (const command of candidates) {
		try {
			await runDetached(command, [path])
			return
		} catch (error) {
			lastError = error
		}
	}
	throw lastError ?? new Error("no desktop opener found")
}

function editorCommand() {
	return process.env.EDITOR || process.env.VISUAL || "vi"
}

function shellCommand() {
	return process.env.SHELL || "/bin/sh"
}

async function withSuspended(suspend, resume, fn) {
	if (suspend) suspend()
	try {
		return await fn()
	} finally {
		if (resume) resume()
	}
}

async function runCommand(command, args, options) {
	const { spawn } = await loadChildProcess()
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", ...options })
		child.on("error", reject)
		child.on("exit", (code, signal) => {
			if (code === 0) resolve()
			else reject(new Error(`${command} exited with ${signal ?? code}`))
		})
	})
}

async function runDetached(command, args) {
	const { spawn } = await loadChildProcess()
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" })
		child.on("error", reject)
		child.unref()
		resolve()
	})
}

export { createNodeOs, createNullOs }

// EOF
