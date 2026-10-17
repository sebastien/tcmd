// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/os
// Host adapter for tinyjs. Opening/editing is delegated to the OS's default
// application. Explicit shell commands run in a non-interactive shell; bounded
// output is returned to the caller and shown in a native alert.

function createDesktopOs({ call, tiny = globalThis.tiny }) {
	return {
		canEdit: true,
		open: (path) => call("hostOpen", { path }),
		edit: (path) => call("hostEdit", { path }),
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
