// Project: TinyCommand
// License: BSD
// Module: tcmd/desktop/fs
// Frontend adapter: forward the shared core's filesystem contract over named
// tinyjs RPC calls. `createDesktopFs` is async because it caches immutable
// home/cwd/root values required by the synchronous adapter getters.

function createDesktopFs({ call }) {
	if (typeof call !== "function") throw new TypeError("an RPC call function is required")
	return call("fsInfo").then((info) => ({
		readDir: (path) => call("fsReadDir", { path }),
		stat: (path) => call("fsStat", { path }),
		isDir: async (path) => Boolean((await call("fsStat", { path }))?.isDir),
		readTextHead: (path, maxBytes) => call("fsReadTextHead", { path, maxBytes }),
		du: (path) => call("fsDu", { path }),
		disk: (path) => call("fsDisk", { path }),
		copy: (from, to) => call("fsCopy", { from, to }),
		move: (from, to) => call("fsMove", { from, to }),
		trash: (paths) => call("fsTrash", { paths }),
		trashList: () => call("fsTrashList"),
		restore: (paths) => call("fsRestore", { paths }),
		erase: (paths) => call("fsErase", { paths }),
		touch: (path) => call("fsTouch", { path }),
		mkdir: (path) => call("fsMkdir", { path }),
		home: () => info.home,
		cwd: () => info.cwd,
		root: () => info.root,
		host: () => info.host,
	}))
}

export { createDesktopFs }

// EOF
