// tinyjs backend entry point. The app bridge is the only path from the webview
// to filesystem and process access.

import { createDesktopBackend } from "./api.js"

const desktop = createDesktopBackend({ runtime: tjs })

export const api = desktop.api
export const onOpenFiles = desktop.onOpenFiles
