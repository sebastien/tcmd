import { describe, expect, test } from "bun:test"
import { effect } from "select/state/cells"
import { createDirectory } from "../../src/js/tcmd/core/directory.js"
import { createMockFs } from "../helpers/mock-fs.js"

const TREE = {
	"/": [{ name: "home", isDir: true }],
	"/home": [
		{ name: "tester", isDir: true },
		{ name: "notes.txt", text: "hello\nworld\n", size: 12 },
	],
	"/home/tester": [{ name: "notes.txt", text: "hello\nworld\n", size: 12 }],
}

function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

function deferred() {
	let resolve, reject
	const promise = new Promise((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}

describe("directory", () => {
	test("navigation keeps the old snapshot until one coherent commit", async () => {
		const fs = createMockFs(TREE)
		const dir = createDirectory({ fs, path: "/home" })
		await dir.refresh()
		dir.setFilter("notes")
		dir.toggleMark()
		const oldEntries = dir.entries.value
		const oldMarks = dir.marked.value
		const pending = deferred()
		const disk = deferred()
		fs.readDir = () => pending.promise
		fs.disk = () => disk.promise
		const snapshots = []
		const stop = effect([dir.path, dir.entries, dir.cursor, dir.marked], () => {
			snapshots.push({
				path: dir.path.value,
				entries: dir.entries.value.map((entry) => entry.path),
				cursor: dir.cursor.value,
				filter: dir.filter.value,
				marks: [...dir.marked.value],
				entry: dir.currentEntry()?.path,
			})
		})
		try {
			const navigation = dir.navigate("/home/tester")
			await tick()
			expect(dir.path.value).toBe("/home")
			expect(dir.entries.value).toBe(oldEntries)
			expect(dir.filter.value).toBe("notes")
			expect(dir.marked.value).toBe(oldMarks)
			expect(dir.loading.value).toBe(true)
			pending.resolve([{ name: "new.txt", path: "/home/tester/new.txt", isDir: false }])
			await tick()
			// The listing commits without waiting for capacity information.
			expect(dir.path.value).toBe("/home/tester")
			expect(dir.loading.value).toBe(false)
			expect(dir.disk.value).toBeNull()
			for (const snapshot of snapshots) {
				if (snapshot.path === "/home") {
					expect(snapshot.entries).toEqual(["/home/notes.txt"])
					expect(snapshot.filter).toBe("notes")
					expect(snapshot.marks).toEqual(["/home/notes.txt"])
					expect(snapshot.entry).toBe("/home/notes.txt")
				} else {
					expect(snapshot.path).toBe("/home/tester")
					expect(snapshot.entries).toEqual(["/home/tester/new.txt"])
					expect(snapshot.filter).toBe("")
					expect(snapshot.marks).toEqual([])
					expect(snapshot.cursor).toBe(0)
					expect(snapshot.entry).toBe("/home/tester/new.txt")
				}
			}
			disk.resolve({ free: 10, total: 20 })
			await navigation
			expect(dir.disk.value).toEqual({ free: 10, total: 20 })
		} finally {
			stop()
			dir.dispose()
		}
	})

	test.each(["older", "newer"])("overlapping navigation with %s finishing first ignores stale reads", async (firstToFinish) => {
		const fs = createMockFs(TREE)
		const dir = createDirectory({ fs, path: "/home" })
		await dir.refresh()
		const older = deferred()
		const newer = deferred()
		fs.readDir = (path) => path === "/home/tester" ? older.promise : newer.promise
		const first = dir.navigate("/home/tester")
		const second = dir.navigate("/")
		if (firstToFinish === "older") {
			older.resolve([{ name: "stale", path: "/home/tester/stale" }])
			await first
			expect(dir.path.value).toBe("/home")
			expect(dir.loading.value).toBe(true)
		}
		newer.resolve([{ name: "home", path: "/home", isDir: true }])
		await second
		if (firstToFinish === "newer") {
			older.resolve([{ name: "stale", path: "/home/tester/stale" }])
			await first
		}
		expect(dir.path.value).toBe("/")
		expect(dir.entries.value.map((entry) => entry.path)).toEqual(["/home"])
		expect(dir.history.stack.map((entry) => entry.path)).toEqual(["/home", "/"])
		dir.dispose()
	})

	test("stale read failures cannot replace the current error or loading state", async () => {
		const fs = createMockFs(TREE)
		const dir = createDirectory({ fs, path: "/home" })
		await dir.refresh()
		const pending = deferred()
		const readDir = fs.readDir
		fs.readDir = (path) => path === "/home/tester" ? pending.promise : readDir(path)
		const stale = dir.navigate("/home/tester")
		await dir.navigate("/")
		pending.reject(new Error("stale error"))
		await stale
		expect(dir.path.value).toBe("/")
		expect(dir.error.value).toBeNull()
		expect(dir.loading.value).toBe(false)
		dir.dispose()
	})

	test("a late refresh cannot overwrite navigation or its disk figures", async () => {
		const fs = createMockFs(TREE)
		const dir = createDirectory({ fs, path: "/home" })
		await dir.refresh()
		const pending = deferred()
		fs.disk = (path) => path === "/home" ? pending.promise : Promise.resolve({ free: 1, total: 2 })
		const refresh = dir.refresh()
		await tick()
		await dir.navigate("/home/tester")
		pending.resolve({ free: 100, total: 200 })
		await refresh
		expect(dir.path.value).toBe("/home/tester")
		expect(dir.disk.value).toEqual({ free: 1, total: 2 })
		dir.dispose()
	})

	test("failed navigation preserves the displayed directory and history", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		dir.cursor.set(1)
		dir.toggleMark()
		const entries = dir.entries.value
		await dir.navigate("/missing")
		expect(dir.path.value).toBe("/home")
		expect(dir.entries.value).toBe(entries)
		expect(dir.cursor.value).toBe(1)
		expect([...dir.marked.value]).toEqual(["/home/notes.txt"])
		expect(dir.history.stack.map((entry) => entry.path)).toEqual(["/home"])
		expect(dir.error.value).toContain("ENOENT")
		expect(dir.loading.value).toBe(false)
		dir.dispose()
	})

	test("currentEntry reports the selected entry and its stat fields", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		expect(dir.currentEntry().name).toBe("tester")
		expect(dir.currentEntry().isDir).toBe(true)
		expect(dir.currentEntry().mode).toBe(0o040755)

		dir.cursor.set(1) // notes.txt
		expect(dir.currentEntry().name).toBe("notes.txt")
		expect(dir.currentEntry().mode).toBe(0o100644)
		expect(dir.currentEntry().owner).toBe("")
		dir.dispose()
	})

	test("navigation history walks back and forward", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		await dir.navigate("/home/tester")
		dir.setFilter("notes")
		await dir.navigate("/")
		expect(dir.path.value).toBe("/")

		await dir.back()
		expect(dir.path.value).toBe("/home/tester")
		// Back restores the view as it was left, filter included.
		expect(dir.filter.value).toBe("notes")
		await dir.back()
		expect(dir.path.value).toBe("/home")
		await dir.back() // no-op at the start of the history
		expect(dir.path.value).toBe("/home")

		await dir.forward()
		expect(dir.path.value).toBe("/home/tester")
		await dir.forward()
		expect(dir.path.value).toBe("/")
		await dir.forward() // no-op at the end of the history
		expect(dir.path.value).toBe("/")
		dir.dispose()
	})

	test("a new navigation truncates the forward history", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		await dir.navigate("/home/tester")
		await dir.back()
		await dir.navigate("/")
		await dir.forward() // the /home/tester branch is gone
		expect(dir.path.value).toBe("/")
		dir.dispose()
	})

	// A tree where the directory navigated *from* is not the first entry, so
	// landing on it cannot pass by accident with the cursor at the top.
	function createWideFs() {
		return createMockFs({
			"/": [{ name: "work", isDir: true }],
			"/work": [
				{ name: "alpha", isDir: true },
				{ name: "mid", isDir: true },
				{ name: "omega", isDir: true },
			],
			"/work/mid": [
				{ name: "a.txt", text: "a", size: 1 },
				{ name: "b.txt", text: "b", size: 1 },
				{ name: "c.txt", text: "c", size: 1 },
			],
		})
	}

	test("up lands the cursor on the directory it came from", async () => {
		const dir = createDirectory({ fs: createWideFs(), path: "/work/mid" })
		await dir.refresh()
		await dir.up()
		expect(dir.path.value).toBe("/work")
		// `mid` is the second of three directories: the cursor followed it up
		// instead of resetting to the top.
		expect(dir.entries.value[dir.cursor.value].name).toBe("mid")
		dir.dispose()
	})

	test("re-entering a directory restores the cursor it had", async () => {
		const dir = createDirectory({ fs: createWideFs(), path: "/work" })
		await dir.refresh()
		dir.cursor.set(1) // mid
		await dir.open() // first visit to /work/mid: the cursor starts at the top
		expect(dir.path.value).toBe("/work/mid")
		expect(dir.cursor.value).toBe(0)
		dir.cursor.set(2) // c.txt
		await dir.up() // back to /work, cursor on `mid`
		expect(dir.path.value).toBe("/work")
		expect(dir.entries.value[dir.cursor.value].name).toBe("mid")
		await dir.open() // re-entering lands on c.txt again
		expect(dir.path.value).toBe("/work/mid")
		expect(dir.cursor.value).toBe(2)
		dir.dispose()
	})

	test("clearing a navigation filter does not reset the remembered cursor", async () => {
		const dir = createDirectory({ fs: createWideFs(), path: "/work/mid" })
		await dir.refresh()
		dir.cursor.set(2)
		await dir.up()
		dir.setFilter("mid")
		await dir.open()
		expect(dir.filter.value).toBe("")
		expect(dir.cursor.value).toBe(2)
		expect(dir.currentEntry().path).toBe("/work/mid/c.txt")
		dir.dispose()
	})

	test("an empty replacement clears the old cursor entry", async () => {
		const dir = createDirectory({ fs: createMockFs({ ...TREE, "/empty": [] }), path: "/home" })
		await dir.refresh()
		await dir.navigate("/empty")
		expect(dir.entries.value).toEqual([])
		expect(dir.currentEntry()).toBeUndefined()
		dir.dispose()
	})

	test("dispose cancels an in-flight read", async () => {
		const fs = createMockFs(TREE)
		const dir = createDirectory({ fs, path: "/home" })
		await dir.refresh()
		const entries = dir.entries.value
		const pending = deferred()
		fs.readDir = () => pending.promise
		const navigation = dir.navigate("/home/tester")
		await tick()
		dir.dispose()
		pending.resolve([{ name: "late.txt", path: "/home/tester/late.txt", isDir: false }])
		await navigation
		// The disposed directory never publishes the late listing.
		expect(dir.path.value).toBe("/home")
		expect(dir.entries.value).toBe(entries)
	})

	test("back restores the cursor and marks the entry had", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		dir.cursor.set(1) // notes.txt
		dir.toggleMark()
		await dir.navigate("/home/tester")
		expect([...dir.marked.value]).toEqual([])

		await dir.back()
		expect(dir.path.value).toBe("/home")
		expect(dir.cursor.value).toBe(1)
		expect([...dir.marked.value]).toEqual(["/home/notes.txt"])
		dir.dispose()
	})

	test("a non-recording move changes the listing without touching the history", async () => {
		const dir = createDirectory({ fs: createMockFs(TREE), path: "/home" })
		await dir.refresh()
		const depth = dir.history.stack.length
		await dir.navigate("/home/tester", { record: false })
		expect(dir.path.value).toBe("/home/tester")
		expect(dir.history.stack.length).toBe(depth)
		// The cursor is no longer restored by a stale memory entry either.
		await dir.back()
		expect(dir.path.value).toBe("/home/tester")
		dir.dispose()
	})

	test("history entries carry the owner context and restore it", async () => {
		let active = "left"
		const dir = createDirectory({
			fs: createMockFs(TREE),
			path: "/home",
			context: { get: () => active, set: (value) => { active = value } },
		})
		await dir.refresh()
		await dir.navigate("/home/tester")
		expect(dir.history.current().context).toBe("left")

		// The owner moved focus elsewhere; back restores the captured one.
		active = "parent"
		await dir.back()
		expect(active).toBe("left")
		dir.dispose()
	})
})
