#!/usr/bin/env bun
// TinyCommand `tcmd` entry point.
const raw = process.argv.slice(2).filter((arg) => arg !== "-")
// `--server` is a mode flag, not a path: accept it in any position.
const server = raw.includes("--server")
const paths = raw.filter((arg) => arg !== "--server")
if (server) {
	if (paths.length > 0) {
		console.error("Usage: tcmd --server (configure with HOST, PORT and TCMD_WEB_ROOT)")
		process.exit(1)
	}
	await import("../scripts/serve-web.js").then((web) => web.main())
} else {
	await import("../src/js/tcmd/tui/index.js").then((tui) => tui.main(paths))
}
