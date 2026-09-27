// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tcmd/web/seed
// Demo tree for the browser view. `seedOpfs(fs)` writes it once per storage,
// guarded by a `/.seeded` marker, so a user-emptied tree is not re-populated
// on every reload. Takes any adapter with `stat` plus the OPFS `writeText`
// extra (see `web/opfs.js`), which keeps it testable off the browser.

// Constant: DEMO_TREE
// Absolute path -> UTF-8 contents; parent directories are created on demand.
const DEMO_TREE = {
	"/README.md": [
		"# TinyCommand web",
		"",
		"This tree lives in the browser's Origin Private File System (OPFS) and",
		"is browsed by the very same core that drives the terminal UI.",
		"",
		"Handy keys:",
		"- Enter/Right  open a directory",
		"- Left/Backspace  go to the parent directory",
		"- Tab  switch pane",
		"- Space  mark the current entry",
		"- t / ^W  new / close tab",
		"- ^P  command palette",
		"- :  scripting mode (copy, move, delete, ...)",
		"- q  quit (unmounts the UI; reload to start over)",
		"",
		"Open/edit/run are not available in the browser: the web uses the null",
		"host adapter, so those commands report `... is not available in this",
		"environment` in the command bar.",
		"",
		"Deleting moves entries to /.trash instead of removing them for good.",
	].join("\n"),
	"/home/tester/notes.txt": [
		"Notes",
		"=====",
		"",
		"- tcmd shares its core between the TUI and the web view",
		"- components/ holds the renderer-agnostic behaviors",
		"- tui/ binds them to select.tui, web/ to select.js",
	].join("\n"),
	"/home/tester/todo.txt": [
		"TODO",
		"----",
		"[x] two panes",
		"[x] tabs",
		"[x] command palette",
		"[ ] quick find",
		"[ ] bookmarks",
	].join("\n"),
	"/documents/welcome.txt": [
		"Welcome to the TinyCommand OPFS demo.",
		"",
		"Everything you do here happens in the browser's private storage:",
		"create tabs, mark files, copy/move/erase inside this tree.",
		"",
		"Reload the page and your changes are still there.",
	].join("\n"),
	"/documents/tips.txt": [
		"Tip: the preview follows the cursor; `v` toggles it.",
		"Tip: `stat` in scripting mode shows size details in the preview.",
		"Tip: marked entries feed the $A/$B filesets in scripting mode.",
	].join("\n"),
	"/projects/tcmd/README.md": [
		"# tcmd (mirror)",
		"",
		"A pretend checkout, good for trying copy/erase on directories.",
	].join("\n"),
	"/projects/tcmd/src/main.js": [
		"export function main() {",
		'\treturn "hello from a seeded OPFS file"',
		"}",
		"",
	].join("\n"),
}

// Function: seedOpfs
// Writes the demo tree when the `/.seeded` marker is absent.
async function seedOpfs(fs) {
	if (await fs.stat("/.seeded")) return false
	for (const [path, text] of Object.entries(DEMO_TREE)) await fs.writeText(path, text)
	await fs.writeText("/.seeded", "")
	return true
}

export { DEMO_TREE, seedOpfs }

// EOF
