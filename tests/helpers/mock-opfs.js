// Project: TinyCommand
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: tests/helpers/mock-opfs
// In-memory stand-in for the OPFS handle API, covering just what
// `src/js/tcmd/web/opfs.js` exercises: directory/file handles, `values()`,
// `getFile()` and `createWritable()`. Only the adapters are faked; file bytes
// are real (Blob/File), so slicing and decoding behave like the browser.

// Class: FakeFileHandle
// File handle over a `{ kind: "file", bytes, mtimeMs }` node.
class FakeFileHandle {
	constructor(name, node) {
		this.kind = "file"
		this.name = name
		this._node = node
	}

	async getFile() {
		return new File([this._node.bytes], this.name, { lastModified: this._node.mtimeMs })
	}

	async createWritable() {
		const node = this._node
		const parts = []
		return {
			async write(data) {
				parts.push(data instanceof Blob ? data : new Blob([data]))
			},
			async close() {
				node.bytes = new Uint8Array(await new Blob(parts).arrayBuffer())
				node.mtimeMs = Date.now()
			},
			async abort() {
				parts.length = 0
			},
		}
	}
}

// Class: FakeDirectoryHandle
// Directory handle over a `{ kind: "dir", children: Map }` node.
class FakeDirectoryHandle {
	constructor(name, node) {
		this.kind = "directory"
		this.name = name
		this._node = node
	}

	async getDirectoryHandle(name, { create = false } = {}) {
		let child = this._node.children.get(name)
		if (!child) {
			if (!create) throw domError("NotFoundError")
			child = { kind: "dir", children: new Map() }
			this._node.children.set(name, child)
		}
		if (child.kind !== "dir") throw domError("TypeMismatchError")
		return new FakeDirectoryHandle(name, child)
	}

	async getFileHandle(name, { create = false } = {}) {
		let child = this._node.children.get(name)
		if (!child) {
			if (!create) throw domError("NotFoundError")
			child = { kind: "file", bytes: new Uint8Array(), mtimeMs: Date.now() }
			this._node.children.set(name, child)
		}
		if (child.kind !== "file") throw domError("TypeMismatchError")
		return new FakeFileHandle(name, child)
	}

	async removeEntry(name, { recursive = false } = {}) {
		const child = this._node.children.get(name)
		if (!child) throw domError("NotFoundError")
		if (child.kind === "dir" && child.children.size && !recursive) {
			throw domError("InvalidModificationError")
		}
		this._node.children.delete(name)
	}

	async *values() {
		for (const [name, child] of this._node.children) {
			yield child.kind === "dir"
				? new FakeDirectoryHandle(name, child)
				: new FakeFileHandle(name, child)
		}
	}
}

function domError(name) {
	const error = new Error(name)
	error.name = name
	return error
}

// Function: createMockOpfs
// Returns `{ root, rootNode }`: the fake root handle to inject into
// `createOpfsFs({ root })` and the raw node for tree assertions.
function createMockOpfs() {
	const rootNode = { kind: "dir", children: new Map() }
	return { root: new FakeDirectoryHandle("", rootNode), rootNode }
}

export { createMockOpfs, FakeDirectoryHandle, FakeFileHandle }

// EOF
