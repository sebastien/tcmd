// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-11-03

// Module: tcmd/tui/server
// Host hook behind the TUI's `server local` / `server lan` commands: starts
// and stops the web UI server from `web/server` (the same one
// `tcmd --server` runs). Core only sees `session.toggleServer` and the
// `webServer` cell; port, bind address and mode stay in this terminal adapter.
//
// Modes:
// - "local" binds loopback (127.0.0.1): only this machine can reach the UI.
// - "lan" binds every interface (`::`, dual-stack where the system allows it)
//   and displays the machine hostname ($HOSTNAME, default `os.hostname()`) in
//   its URL, so peers on the network can reach it.
//
// Binding the hostname itself is not enough: a machine name often resolves to
// several addresses (link-local IPv6 among them) and the server would bind only
// one of them — typically one that is unreachable from the LAN.
//
// Environment: PORT (default 8787), TCMD_WEB_ROOT (passed through to the
// server).

import nodeOs from "node:os"
import { hostUrl, startWebServer } from "../web/server.js"

// Constant: LOCAL_BIND_HOST / LAN_BIND_HOST
// The interfaces each mode listens on. `::` accepts IPv4 peers too on systems
// with the usual dual-stack default, and every IPv6 peer otherwise.
const LOCAL_BIND_HOST = "127.0.0.1"
const LAN_BIND_HOST = "::"

// Function: createServerToggle
// Builds the toggle the session installs as `toggleServer`. `toggle(mode)`
// starts the requested mode, switches modes when the other one is running, or
// stops the server when the same mode is requested again (or when the panel
// asks for `mode: "stop"`). It resolves to `{ mode, url, token }` while running, or
// null after stopping. `serve` is injectable for tests.
function createServerToggle({
	hostname = process.env.HOSTNAME || nodeOs.hostname(),
	port = Number(process.env.PORT ?? 8787),
	serve = startWebServer,
} = {}) {
	let running = null
	let mode = null

	async function start(nextMode) {
		const bindHost = nextMode === "lan" ? LAN_BIND_HOST : LOCAL_BIND_HOST
		const result = await serve({ hostname: bindHost, port, quiet: true })
		running = result.server
		mode = nextMode
		// The URL carries the reachable name, not the wildcard bind address.
		const displayHost = nextMode === "lan" ? hostname : LOCAL_BIND_HOST
		return { mode: nextMode, url: hostUrl(displayHost, result.server.port), token: result.token }
	}

	async function stop() {
		if (!running) return null
		await running.stop(true)
		running = null
		mode = null
		return null
	}

	async function toggle(nextMode = "local") {
		// The panel's explicit `server stop` entry.
		if (nextMode === "stop") return stop()
		const target = nextMode === "lan" ? "lan" : "local"
		if (running) {
			// The same mode toggles off; the other mode switches over.
			const same = mode === target
			await stop()
			if (same) return null
		}
		return start(target)
	}

	return { toggle, stop }
}

export { createServerToggle, LAN_BIND_HOST, LOCAL_BIND_HOST }

// EOF
