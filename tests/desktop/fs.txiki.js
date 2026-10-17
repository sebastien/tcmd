// Optional integration check: ~/.tinyjs/bin/tjs run tests/desktop/fs.txiki.js
import { createDesktopFs } from "../../src/js/tcmd/desktop/backend/fs.js"

const temporary = tjs.env.TCMD_TEST_TMP ?? decodeURIComponent(new URL(".", import.meta.url).pathname)
const root = await tjs.makeTempDir(`${temporary}/.tcmd-fs-real-XXXXXX`)
const check = (condition, message) => {
	if (!condition) throw new Error(message)
}
const mode = async (path) => (await tjs.stat(path)).mode & 0o7777
const write = async (path, text) => {
	const handle = await tjs.open(path, "w")
	try {
		await handle.write(new TextEncoder().encode(text))
	} finally {
		await handle.close()
	}
}
const options = { home: root, cwd: root, env: { OS: "Linux" } }
try {
	const adapter = createDesktopFs({ runtime: tjs, ...options })
	await tjs.makeDir(`${root}/source`, { mode: 0o700 })
	await tjs.makeDir(`${root}/source/nested`, { mode: 0o700 })
	await write(`${root}/source/nested/file`, "private")
	await tjs.chmod(`${root}/source/nested`, 0o500)
	await tjs.symlink(`${root}/source`, `${root}/alias`)
	const bounded = new Proxy({}, {
		get(_target, key) {
			if (key === "makeDir") return () => { throw new Error("unexpected creation") }
			return tjs[key]
		},
	})
	try {
		await createDesktopFs({ runtime: bounded, ...options }).copy(`${root}/source`, `${root}/alias/new`)
		throw new Error("alias copy accepted")
	} catch (error) {
		check(error.message.includes("cannot copy a path into itself"), error.message)
	}
	await adapter.copy(`${root}/source`, `${root}/copied`)
	check(await mode(`${root}/copied`) === 0o700, "copy root mode")
	check(await mode(`${root}/copied/nested`) === 0o500, "copy read-only nested mode")
	await tjs.chmod(`${root}/source/nested`, 0o750)
	const exdev = new Proxy({}, {
		get(_target, key) {
			if (key === "rename") return async () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }) }
			return tjs[key]
		},
	})
	await createDesktopFs({ runtime: exdev, ...options }).move(`${root}/source`, `${root}/moved`)
	check(await mode(`${root}/moved`) === 0o700, "move root mode")
	check(await mode(`${root}/moved/nested`) === 0o750, "move nested mode")
	let removed = false
	try {
		await tjs.lstat(`${root}/source`)
	} catch (error) {
		if (error.code !== "ENOENT") throw error
		removed = true
	}
	check(removed, "move must remove source")
	await write(`${root}/trash-me`, "trash contents")
	const [row] = await adapter.trash([`${root}/trash-me`])
	check((await adapter.trashList())[0].originalPath === `${root}/trash-me`, "metadata")
	await adapter.restore([row.to])
	check(new TextDecoder().decode(await tjs.readFile(`${root}/trash-me`)) === "trash contents", "restore")
	console.log("real txiki filesystem checks passed")
} finally {
	for (const name of ["source", "copied", "moved"]) {
		await tjs.chmod(`${root}/${name}/nested`, 0o700).catch(() => {})
	}
	await tjs.remove(root)
}
