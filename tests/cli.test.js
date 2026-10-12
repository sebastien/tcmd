import { describe, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { hostUrl, main as serveWeb } from "../scripts/serve-web.js"

const launcher = fileURLToPath(new URL("../bin/tcmd", import.meta.url))
const script = fileURLToPath(new URL("../bin/tcmd.js", import.meta.url))

async function originFrom(child) {
	let output = ""
	for await (const chunk of child.stdout) {
		output += new TextDecoder().decode(chunk)
		const match = output.match(/http:\/\/[^\s:]+:\d+/)
		if (match) return match[0]
	}
	throw new Error(`Server exited before listening: ${await new Response(child.stderr).text()}`)
}

describe("tcmd --server", () => {
	test("the installed-style launcher serves the UI and authenticated API from another cwd", async () => {
		const root = await mkdtemp("/tmp/opencode/tcmd-cli-")
		let child
		try {
			const link = join(root, "tcmd")
			await symlink(launcher, link)
			child = Bun.spawn([link, "--server"], {
				cwd: root,
				env: { ...process.env, PORT: "0", TCMD_WEB_ROOT: root },
				stdout: "pipe",
				stderr: "pipe",
			})
			const origin = await originFrom(child)
			const page = await fetch(origin)
			expect(page.status).toBe(200)
			const html = await page.text()
			const token = html.match(/name="tcmd-token" content="([^"]+)"/)[1]
			expect(token).not.toBe("__TCMD_TOKEN__")
			expect((await fetch(`${origin}/main.js`)).status).toBe(200)
			expect((await fetch(`${origin}/style.css`)).status).toBe(200)
			expect((await fetch(`${origin}/api/info`)).status).toBe(403)
			const info = await (await fetch(`${origin}/api/info`, { headers: { "x-tcmd-token": token } })).json()
			expect(info.root).toBe(root)
			expect(info.cwd).toBe(root)
		} finally {
			child?.kill()
			if (child) await child.exited
			await rm(root, { recursive: true, force: true })
		}
	})

	test("a missing browser bundle is built on demand", async () => {
		const root = await mkdtemp("/tmp/opencode/tcmd-build-")
		let server
		try {
			const publicDir = join(root, "public")
			await mkdir(publicDir)
			for (const file of ["index.html", "style.css"]) {
				await copyFile(new URL(`../public/${file}`, import.meta.url), join(publicDir, file))
			}
			;({ server } = await serveWeb({ publicDir: pathToFileURL(`${publicDir}/`), root, port: 0 }))
			const bundle = Bun.file(join(publicDir, "main.js"))
			expect(await bundle.exists()).toBe(true)
			expect(bundle.size).toBeGreaterThan(0)
			expect((await fetch(`http://127.0.0.1:${server.port}/main.js`)).status).toBe(200)
		} finally {
			await server?.stop(true)
			await rm(root, { recursive: true, force: true })
		}
	})

	test("HOST and PORT environment variables select the listening address", async () => {
		const root = await mkdtemp("/tmp/opencode/tcmd-host-")
		let child
		try {
			child = Bun.spawn([process.execPath, script, "--server"], {
				cwd: root,
				env: { ...process.env, HOST: "127.0.0.2", PORT: "0", TCMD_WEB_ROOT: root },
				stdout: "pipe",
				stderr: "pipe",
			})
			const origin = await originFrom(child)
			expect(origin).toContain("127.0.0.2")
			expect((await fetch(origin)).status).toBe(200)
		} finally {
			child?.kill()
			if (child) await child.exited
			await rm(root, { recursive: true, force: true })
		}
	})

	test("the served URL brackets IPv6 literals", () => {
		expect(hostUrl("127.0.0.1", 8020)).toBe("http://127.0.0.1:8020")
		expect(hostUrl("::", 8020)).toBe("http://[::]:8020")
		expect(hostUrl("fe80::1%wlan0", 8020)).toBe("http://[fe80::1%wlan0]:8020")
		expect(hostUrl("minibench", 8020)).toBe("http://minibench:8020")
	})

	test("extra server arguments fail without launching the TUI", async () => {
		for (const args of [["--server", "/extra"], ["/extra", "--server"]]) {
			const child = Bun.spawn([process.execPath, script, ...args], { stdout: "pipe", stderr: "pipe" })
			expect(await child.exited).toBe(1)
			expect(await new Response(child.stderr).text()).toContain("Usage: tcmd --server")
		}
	})
})
