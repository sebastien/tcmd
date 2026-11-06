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
// - `capture(command, args, options)`: Promise<{ code, stdout, stderr } | null>
//   - non-interactive command with captured output (`cwd`, `input`, `timeout`),
//   used by the VCS adapter (`core/vcs`). Null when the command is missing;
//   omitted by hosts that cannot spawn processes (the web).
// - `copy(text)`: boolean - best-effort clipboard write. The TUI sends OSC 52
//   through the renderer; the browser and desktop webview use the Clipboard
//   API. False when the host has no clipboard.
// - `screenshot({ svgPath, ansPath })`: Promise<{ svgPath, ansPath, ... }> -
//   optional. Writes the current screen to those two files. Only the terminal
//   presentation has a grid to capture; a host without one omits the hook and
//   the `screenshot` operation reports that it is unavailable.
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
// uses to release and restore the terminal around interactive commands;
// `copy` is the TUI's OSC 52 hook (`renderer.copyToClipboardOSC52`), and
// `screenshot` writes the renderer's current grid (see `tui/screenshot`).
function createNodeOs({ suspend, resume, copy, screenshot } = {}) {
	return {
		canEdit: true,
		...(screenshot ? { screenshot } : {}),
		copy(text) {
			return Boolean(copy?.(`${text ?? ""}`))
		},
		async capture(command, args, options) {
			return captureCommand(command, args, options)
		},
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

// Function: copyToBrowserClipboard
// Best-effort clipboard write for a browser or desktop webview. The write is
// asynchronous but fire-and-forget; a refused write (no permission, no user
// gesture) leaves the clipboard untouched.
function copyToBrowserClipboard(text) {
	const clipboard = globalThis.navigator?.clipboard
	if (!clipboard?.writeText) return false
	void clipboard.writeText(`${text ?? ""}`).catch(() => {})
	return true
}

// Function: createNullOs
// Host adapter for environments without a shell (web): every operation fails
// with a clear message, which the dispatch path reports in the command bar.
// Clipboard access is the exception: the browser has one.
function createNullOs() {
	const unsupported = (name) => async () => {
		throw new Error(`${name} is not available in this environment`)
	}
	return {
		canEdit: false,
		copy: (text) => copyToBrowserClipboard(text),
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

// Constant: CAPTURE_TIMEOUT
// Least time a captured command may run before it is killed. A VCS status
// command on a very large repository can be slow, but a hung one must never
// pin a background promise forever.
const CAPTURE_TIMEOUT = 5000

// Constant: CAPTURE_LIMIT
// Upper bound on captured output. Beyond it the command is killed and resolves
// null, so a caller never parses a partial listing (the desktop backend uses
// the same bound).
const CAPTURE_LIMIT = 4 * 1024 * 1024

// Function: captureCommand
// Runs `command` with captured output and resolves `{ code, stdout, stderr }`.
// Resolves null when the command cannot start (missing binary, permissions)
// or exceeds `options.timeout` (default `CAPTURE_TIMEOUT`); a non-zero exit is
// returned as-is, so callers can treat "no matches" as data.
async function captureCommand(command, args, { cwd, input, timeout = CAPTURE_TIMEOUT } = {}) {
	const { spawn } = await loadChildProcess()
	return new Promise((resolve) => {
		let child
		try {
			child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
		} catch (error) {
			resolve(null)
			return
		}
		let stdout = ""
		let stderr = ""
		let captured = 0
		let settled = false
		const finish = (value) => {
			if (settled) return
			settled = true
			if (timer) clearTimeout(timer)
			resolve(value)
		}
		// A runaway output (a huge repository listing) is a failure, not data:
		// kill it rather than parse a truncated stream.
		const collect = (chunk, append) => {
			if (settled) return
			captured += chunk.length
			if (captured > CAPTURE_LIMIT) {
				try {
					child.kill("SIGKILL")
				} catch (error) {
					// Already gone.
				}
				finish(null)
				return
			}
			append(chunk)
		}
		const timer = timeout > 0
			? setTimeout(() => {
					try {
						child.kill("SIGKILL")
					} catch (error) {
						// Already gone.
					}
					finish(null)
				}, timeout)
			: null
		timer?.unref?.()
		// Decode each stream as UTF-8 up front: appending Buffers would split
		// multi-byte filenames at chunk boundaries.
		child.stdout?.setEncoding?.("utf8")
		child.stderr?.setEncoding?.("utf8")
		child.stdout?.on("data", (chunk) => collect(chunk, (text) => (stdout += text)))
		child.stderr?.on("data", (chunk) => collect(chunk, (text) => (stderr += text)))
		child.on("error", () => finish(null))
		child.on("close", (code, signal) => finish({ code: code ?? (signal ? 1 : 0), stdout, stderr }))
		// A command that exits before reading stdin closes the pipe; an EPIPE
		// here is not an error worth surfacing.
		child.stdin?.on("error", () => {})
		if (input === undefined || input === null) child.stdin?.end()
		else child.stdin?.end(input)
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

export { copyToBrowserClipboard, createNodeOs, createNullOs }

// EOF
