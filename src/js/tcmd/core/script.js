// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/core/script
// The scripting language behind the command palette's scripting mode (`:`):
// line tokenizer, operation parser and runner, plus the completion rows the
// palette lists. A line starts with an operation name (or the `!` alias for
// `run`); arguments may be filesets ($A, $B, $FILE), quoted paths, `~` or
// paths relative to the active pane.

import { getOperation, getOperations, humanSize } from "./operations.js"

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
// the session notice.
async function runLine(session, line, options = {}) {
	const parsed = parseLine(line)
	if (parsed.status !== "ok") {
		if (parsed.error) session.notice.set({ kind: "error", text: parsed.error })
		return parsed.status
	}
	const { op, args } = parsed
	if (op.confirmText && !options.confirmed) {
		session.confirm.set({ text: op.confirmText(args), line })
		return "confirm"
	}
	try {
		const message = await op.run(session, args, options)
		if (message) session.notice.set({ kind: "tip", text: message })
		return "ran"
	} catch (error) {
		session.notice.set({ kind: "error", text: `${error?.message ?? error}` })
		return "error"
	}
}

// Function: scriptItems
// Palette rows for scripting mode: the session's available filesets first,
// then every operation, then matching entries of the active pane (path
// completion). Rows carry the full query replacement `completion` for Tab.
function scriptItems(query, filesets, context = {}) {
	const text = `${query ?? ""}`
	const q = text.trim().toLowerCase()
	const head = q.split(/\s+/)[0] ?? ""
	const rows = []
	const typingFileset = lastToken(q).startsWith("$")
	for (const set of filesets ?? []) {
		const id = set.id.toLowerCase()
		if (head && !id.includes(head) && !q.includes(id) && !typingFileset) continue
		rows.push({
			id: set.id,
			title: set.id,
			kind: "fileset",
			detail: `${set.count} file${set.count === 1 ? "" : "s"}`,
			completion: completeFileset(text, set.id),
		})
	}
	for (const op of getOperations()) {
		if (op.hidden) continue
		const names = [op.name, ...(op.aliases ?? [])]
		const matchesName = !head || names.some((name) => name.toLowerCase().includes(head))
		if (!matchesName && !op.signature.toLowerCase().includes(q)) continue
		rows.push({
			id: `op:${op.name}`,
			title: op.name,
			kind: "op",
			detail: op.signature,
			description: op.description,
			completion: q.includes(" ") ? text.replace(/^\S+/, op.name) : `${op.name} `,
		})
	}
	const last = lastToken(q)
	const token = lastToken(text)
	if (token && !token.startsWith("$")) {
		const at = token.lastIndexOf("/")
		const dirPart = at >= 0 ? token.slice(0, at + 1) : ""
		const prefix = (at >= 0 ? token.slice(at + 1) : token).toLowerCase()
		for (const entry of context.entries ?? []) {
			if (!entry.name.toLowerCase().startsWith(prefix)) continue
			const name = entry.isDir ? `${entry.name}/` : entry.name
			rows.push({
				id: `path:${entry.path}`,
				title: name,
				kind: "path",
				detail: entry.isDir ? "dir" : humanSize(entry.size),
				completion: replaceLastToken(text, `${dirPart}${name}`),
			})
		}
	}
	return rows
}

// Function: lastToken
// The last whitespace-separated token, case preserved.
function lastToken(text) {
	const match = /(\S+)\s*$/.exec(`${text ?? ""}`)
	return match ? match[1] : ""
}

// Function: completionToken
// For a query whose last token contains "/", the directory part to read and
// the name prefix being completed; null when the token is not a path.
function completionToken(query) {
	const token = lastToken(query)
	if (!token || token.startsWith("$")) return null
	const at = token.lastIndexOf("/")
	if (at < 0) return null
	return { dir: token.slice(0, at) || "/", prefix: token.slice(at + 1) }
}

// Function: replaceLastToken
// Replaces the (possibly empty) last whitespace-separated token.
function replaceLastToken(text, replacement) {
	const match = /(\S*)\s*$/.exec(text)
	return `${text.slice(0, match.index)}${replacement}`
}

// Function: completeFileset
// Replaces the `$…` token being typed, or appends the fileset.
function completeFileset(text, id) {
	if (/\$\w*$/.test(text.trimEnd())) return replaceLastToken(text, id)
	return `${text} ${id}`.trim()
}

export { completionToken, parseLine, runLine, scriptItems, tokenize }

// EOF
