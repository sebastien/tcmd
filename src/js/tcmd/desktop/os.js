// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/os
// Host adapter for tinyjs. Opening/editing is delegated to the OS's default
// application. Explicit shell commands run in a non-interactive shell; bounded
// output is returned to the caller and shown in a native alert. Captured
// commands (`capture`, used by the VCS adapter) go through `hostCapture`.
// Clipboard writes go through the webview's Clipboard API.

import { copyToBrowserClipboard } from "../core/os.js"

function createDesktopOs({ call, tiny = globalThis.tiny }) {
	return {
		canEdit: true,
		copy: (text) => copyToBrowserClipboard(text),
		open: (path) => call("hostOpen", { path }),
		edit: (path) => call("hostEdit", { path }),
		async capture(command, args, options = {}) {
			const result = await call("hostCapture", {
				command,
				args,
				cwd: options.cwd,
				input: options.input,
				timeout: options.timeout,
			})
			if (!result) return null
			return { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
		},
		async run(command, options = {}) {
			const result = await call("hostRun", { command, cwd: options.cwd })
			const sections = []
			if (result.stdout) sections.push(result.stdout.trimEnd())
			if (result.stderr) sections.push(result.stderr.trimEnd())
			if (result.truncated) sections.push("[Output truncated after 32 KiB per stream]")
			if (result.exitCode !== 0) sections.push(`Process exited with status ${result.exitCode}`)
			if (result.signal) sections.push(`Process stopped by ${result.signal}`)
			if (sections.length) await tiny.dialog.alert("Command output", sections.join("\n\n"))
			return result
		},
	}
}

export { createDesktopOs }

// EOF
