import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createDesktopFs } from "../../src/js/tcmd/desktop/backend/fs.js"
import { createNodeRuntime } from "./runtime.js"

describe("tinyjs filesystem adapter", () => {
	let root
	let adapter

	beforeEach(async () => {
		root = await mkdtemp(join(import.meta.dir, ".tcmd-desktop-"))
		adapter = createDesktopFs({ runtime: createNodeRuntime({ home: root, cwd: root }) })
	})

	afterEach(async () => {
		await rm(root, { recursive: true, force: true })
	})

	test("lists symlink targets while preserving link identity and broken links", async () => {
		await mkdir(join(root, "real-dir"))
		await writeFile(join(root, "real-dir", "inside.txt"), "inside")
		await writeFile(join(root, "notes.txt"), "hello")
		await symlink("notes.txt", join(root, "link.txt"))
		await symlink("real-dir", join(root, "link-dir"))
		await symlink("missing", join(root, "broken"))

		const entries = Object.fromEntries((await adapter.readDir(root)).map((entry) => [entry.name, entry]))
		expect(entries["link.txt"]).toMatchObject({ isSymlink: true, target: "notes.txt", isDir: false, size: 5 })
		expect(entries["link-dir"]).toMatchObject({ isSymlink: true, target: "real-dir", isDir: true, size: 0 })
		expect(entries.broken).toMatchObject({ isSymlink: true, target: "missing", isDir: false, size: 0 })
		expect(await adapter.readTextHead(join(root, "link.txt"), 3)).toBe("hel")
		expect((await adapter.stat(join(root, "link-dir"))).isDir).toBe(true)
	})

	test("copies links as links, refuses occupied targets, and blocks recursive copy", async () => {
		const link = join(root, "link")
		const copied = join(root, "copied-link")
		await writeFile(join(root, "target.txt"), "target")
		await symlink("target.txt", link)
		await adapter.copy(link, copied)
		expect((await lstat(copied)).isSymbolicLink()).toBe(true)
		expect(await readFile(copied, "utf8")).toBe("target")
		await expect(adapter.copy(link, copied)).rejects.toMatchObject({ code: "EEXIST" })
		await expect(adapter.copy(root, join(root, "nested"))).rejects.toThrow("cannot copy a path into itself")
	})

	test("trash preserves escaped names and restore refuses to overwrite", async () => {
		const original = join(root, "space %20 name.txt")
		await writeFile(original, "original")
		const [trashed] = await adapter.trash([original])
		const [row] = await adapter.trashList()
		expect(row).toMatchObject({ originalPath: original, trashPath: trashed.to, isDir: false })

		await writeFile(original, "replacement")
		await expect(adapter.restore([trashed.to])).rejects.toMatchObject({ code: "EEXIST" })
		expect(await readFile(original, "utf8")).toBe("replacement")

		await rm(original)
		await adapter.restore([trashed.to])
		expect(await readFile(original, "utf8")).toBe("original")
		expect(await adapter.trashList()).toEqual([])
	})

	test("reserves trash metadata exclusively without overwriting an existing reservation", async () => {
		const runtime = createNodeRuntime({ home: root })
		const flags = []
		const open = runtime.open
		runtime.open = (path, flag) => {
			flags.push(flag)
			return open(path, flag)
		}
		const custom = createDesktopFs({ runtime })
		const info = join(root, ".local/share/Trash/info")
		await mkdir(info, { recursive: true })
		await writeFile(join(info, "file.trashinfo"), "reserved")
		const file = join(root, "file")
		await writeFile(file, "contents")
		const [trashed] = await custom.trash([file])
		expect(flags).toEqual(["wx", "wx"])
		expect(trashed.name).toBe("file.1")
		expect(await readFile(join(info, "file.trashinfo"), "utf8")).toBe("reserved")
		expect(await readFile(join(info, "file.1.trashinfo"), "utf8")).toContain(`Path=${file}`)
		await custom.restore([trashed.to])
		expect(await readFile(file, "utf8")).toBe("contents")
	})

	test("rejects physical self-copies through source or destination ancestor aliases before writing", async () => {
		const source = join(root, "source")
		await mkdir(join(source, "nested"), { recursive: true })
		await symlink(source, join(root, "alias"))
		await symlink(root, join(root, "root-alias"))
		const runtime = createNodeRuntime({ home: root })
		// Bound regressions: a broken preflight must not actually recurse.
		runtime.makeDir = () => { throw new Error("unexpected directory creation") }
		const custom = createDesktopFs({ runtime })
		for (const [from, to] of [
			[source, join(root, "alias/new")],
			[source, join(root, "alias/absent/deeper")],
			[source, join(root, "alias/nested")],
			[source, join(root, "alias")],
			[join(root, "root-alias/source"), join(source, "new")],
		]) {
			await expect(custom.copy(from, to)).rejects.toThrow("cannot copy a path into itself")
		}
		expect(await readdir(source)).toEqual(["nested"])
	})

	test("allows copying through an unrelated destination alias and merging existing directories", async () => {
		await mkdir(join(root, "source/private"), { recursive: true })
		await chmod(join(root, "source/private"), 0o700)
		await writeFile(join(root, "source/private/file"), "contents")
		await mkdir(join(root, "destination"), { mode: 0o750 })
		await chmod(join(root, "destination"), 0o750)
		await symlink(join(root, "destination"), join(root, "alias"))
		await adapter.copy(join(root, "source"), join(root, "alias/copied"))
		await adapter.copy(join(root, "source"), join(root, "destination"))
		expect(await readFile(join(root, "destination/copied/private/file"), "utf8")).toBe("contents")
		expect((await lstat(join(root, "destination/private"))).mode & 0o7777).toBe(0o700)
		expect((await lstat(join(root, "destination"))).mode & 0o7777).toBe(0o750)
	})

	for (const operation of ["copy", "move"]) {
		test(`${operation} preserves nested directory modes without exposing private contents`, async () => {
			const source = join(root, "source")
			const destination = join(root, "destination")
			await mkdir(join(source, "nested"), { recursive: true })
			await chmod(source, 0o750)
			await chmod(join(source, "nested"), 0o700)
			await writeFile(join(source, "nested/file"), "private")
			const runtime = createNodeRuntime({ home: root })
			const makeDir = runtime.makeDir
			const created = []
			runtime.makeDir = async (path, options) => {
				expect(options?.mode).toBe(0o700)
				await makeDir(path, options)
				created.push(path)
				expect((await lstat(path)).mode & 0o7777).toBe(0o700)
			}
			if (operation === "move") {
				runtime.rename = async () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }) }
			}
			await createDesktopFs({ runtime })[operation](source, destination)
			expect(created).toEqual([destination, join(destination, "nested")])
			expect((await lstat(destination)).mode & 0o7777).toBe(0o750)
			expect((await lstat(join(destination, "nested"))).mode & 0o7777).toBe(0o700)
			expect(await readFile(join(destination, "nested/file"), "utf8")).toBe("private")
			if (operation === "move") await expect(lstat(source)).rejects.toMatchObject({ code: "ENOENT" })
		})
	}

	test("EXDEV fallback rejects an aliased descendant without removing the source", async () => {
		const source = join(root, "source")
		await mkdir(source)
		await writeFile(join(source, "file"), "keep")
		await symlink(source, join(root, "alias"))
		const runtime = createNodeRuntime({ home: root })
		runtime.rename = async () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }) }
		await expect(createDesktopFs({ runtime }).move(source, join(root, "alias/new")))
			.rejects.toThrow("cannot copy a path into itself")
		expect(await readdir(source)).toEqual(["file"])
		expect(await readFile(join(source, "file"), "utf8")).toBe("keep")
	})

	test("move does not replace targets and root erasure is refused", async () => {
		const source = join(root, "source.txt")
		const target = join(root, "target.txt")
		await writeFile(source, "source")
		await writeFile(target, "keep")
		await expect(adapter.move(source, target)).rejects.toMatchObject({ code: "EEXIST" })
		expect(await readFile(source, "utf8")).toBe("source")
		expect(await readFile(target, "utf8")).toBe("keep")
		await expect(adapter.erase(["/"])).rejects.toThrow("filesystem root")
	})

	test("uses the app trash under XDG_DATA_HOME when provided", async () => {
		const dataHome = join(root, "custom-data")
		const custom = createDesktopFs({
			runtime: createNodeRuntime({ home: root, cwd: root, env: { XDG_DATA_HOME: dataHome } }),
		})
		const file = join(root, "custom.txt")
		await writeFile(file, "custom")
		const [item] = await custom.trash([file])
		expect(item.to.startsWith(join(dataHome, "Trash", "files"))).toBe(true)
	})

	test("refuses Windows paths instead of interpreting drive roots as POSIX", () => {
		const runtime = createNodeRuntime({ home: root, cwd: root, env: { OS: "Windows_NT" } })
		expect(() => createDesktopFs({ runtime })).toThrow("does not support Windows")
	})
})
