// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: scripts/serve-web
// CLI for the web view server: serves `public/` plus the `/api/*` filesystem
// API (see `src/js/tcmd/web/server.js`). The page uses OPFS when the browser
// has it and falls back to the API otherwise, so both backends come from this
// one command.
//
// Environment: HOST (default 127.0.0.1, an IP literal: 0.0.0.0 or :: serves
// every interface), PORT (default 8787), TCMD_WEB_ROOT (default "/", like the
// TUI).

import { createWebServer } from "../src/js/tcmd/web/server.js"
import { isIP } from "node:net"
import { fileURLToPath } from "node:url"

// Function: hostUrl
// The URL a client should open. IPv6 literals (possibly zone-qualified) are
// bracketed so the result is a valid URL.
function hostUrl(hostname, port) {
	const host = isIP(hostname) === 6 ? `[${hostname}]` : hostname
	return `http://${host}:${port}`
}

// Function: main
// Starts the existing loopback server. Published packages include the bundle;
// a source checkout builds it on demand without depending on the caller's cwd.
async function main(options = {}) {
	const publicDir = options.publicDir ?? new URL("../public/", import.meta.url)
	if (!(await Bun.file(new URL("main.js", publicDir)).exists())) {
		const build = await Bun.build({
			entrypoints: [fileURLToPath(new URL("../src/js/tcmd/web/main.js", import.meta.url))],
			outdir: fileURLToPath(publicDir),
			target: "browser",
		})
		if (!build.success) throw new AggregateError(build.logs, "Could not build the web UI")
	}
	const result = createWebServer({ ...options, publicDir })
	const host = result.server.hostname
	// A machine name resolves to several addresses (often including link-local
	// IPv6), but the server binds only one of them, so prefer an IP literal.
	if (host !== "127.0.0.1" && host !== "localhost" && isIP(host) === 0) {
		console.warn(
			`tcmd web:      warning: ${host} is a name; bound to one of its addresses only.\n` +
				`                Use an IP literal instead (0.0.0.0 or :: for every interface).`
		)
	}
	console.log(`tcmd web:      ${hostUrl(host, result.server.port)}`)
	console.log(`filesystem API: /api/* rooted at ${result.root}`)
	console.log("use ?fs=http for your files, or ?fs=opfs for browser storage")
	return result
}

if (import.meta.main) await main()

export { hostUrl, main }

// EOF
