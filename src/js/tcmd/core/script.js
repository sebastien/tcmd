// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/script
// The TinyCmd scripting language: line tokenizer, operation parser and runner.
// A line starts with an operation name (or the `!` alias for `run`); arguments
// may be filesets ($A, $B, $FILE), quoted paths, `~` or paths relative to the
// active pane. The command panel runs operations structurally and delegates to
// the same `runLine` through `runOperation`.

import { getOperation, runOperation } from "./operations.js"

// Function: tokenize
// Whitespace tokenizer with single/double quotes and backslash escapes.
function tokenize(line) {
	const tokens = []
	let current = ""
	let quote = null
	let escaping = false
	for (const char of `${line ?? ""}`) {
		if (escaping) {
			current += char
			escaping = false
			continue
		}
		if (char === "\\") {
			escaping = true
			continue
		}
		if (quote) {
			if (char === quote) quote = null
			else current += char
			continue
		}
		if (char === '"' || char === "'") {
			quote = char
			continue
		}
		if (/\s/.test(char)) {
			if (current !== "") {
				tokens.push(current)
				current = ""
			}
			continue
		}
		current += char
	}
	if (current !== "") tokens.push(current)
	return tokens
}

// Function: parseLine
// Parses a script line into `{ status, op, args, error }`:
// - "ok": an operation with positional args (raw string for `run`)
// - "empty": nothing to run
// - "error": unknown operation or wrong arity
function parseLine(line) {
	const text = `${line ?? ""}`.trim()
	if (!text) return { status: "empty", error: "empty command" }
	if (text.startsWith("!")) {
		const command = text.slice(1).trim()
		if (!command) return { status: "empty", error: "empty command" }
		return { status: "ok", op: getOperation("run"), args: [command] }
	}
	const tokens = tokenize(text)
	const op = getOperation(tokens[0])
	if (!op) return { status: "error", error: `unknown operation: ${tokens[0]}` }
	const args = op.raw
		? [text.slice(tokens[0].length).trim()]
		: tokens.slice(1)
	if (op.arity) {
		const count = args.filter((arg) => arg !== "").length
		if (count < op.arity.min || (op.arity.max !== undefined && count > op.arity.max)) {
			return { status: "error", error: `usage: ${op.signature}` }
		}
	}
	return { status: "ok", op, args }
}

// Function: runLine
// Parses and runs a script line. Returns "ran", "confirm" (the session
// confirm cell is filled), "empty" or "error"; failures and results land on
// the session notice. Delegates execution to `runOperation`, shared with the
// command panel.
async function runLine(session, line, options = {}) {
	const parsed = parseLine(line)
	if (parsed.status !== "ok") {
		if (parsed.error) session.notice.set({ kind: "error", text: parsed.error })
		return parsed.status
	}
	return runOperation(session, parsed.op, parsed.args, { ...options, line })
}

export { parseLine, runLine, tokenize }

// EOF
