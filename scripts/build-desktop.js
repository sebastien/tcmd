// Project: TinyCommand
// License: BSD
// Build the self-contained webview bundle. tinyjs invokes this hook on
// `tinyjs build`; `desktop:dev` also runs it before opening the native window.

import { copyFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const output = new URL("../desktop/dist/", import.meta.url)
await mkdir(output, { recursive: true })

const result = await Bun.build({
	entrypoints: [fileURLToPath(new URL("../src/js/tcmd/desktop/main.js", import.meta.url))],
	outdir: fileURLToPath(output),
	target: "browser",
	naming: "main.js",
})
if (!result.success) throw new AggregateError(result.logs, "Could not build the TinyCommand desktop frontend")

await copyFile(new URL("../desktop/frontend/index.html", import.meta.url), new URL("index.html", output))
await copyFile(new URL("../public/style.css", import.meta.url), new URL("style.css", output))
await mkdir(new URL("../desktop/dist/fonts/", import.meta.url), { recursive: true })
await copyFile(
	new URL("../public/fonts/M+1CodeNerdFontMono-Regular.ttf", import.meta.url),
	new URL("../desktop/dist/fonts/M+1CodeNerdFontMono-Regular.ttf", import.meta.url),
)
await copyFile(new URL("../public/fonts/OFL.txt", import.meta.url), new URL("../desktop/dist/fonts/OFL.txt", import.meta.url))
await mkdir(new URL("../desktop/dist/licenses/", import.meta.url), { recursive: true })
await copyFile(new URL("../public/licenses/LUCIDE.txt", import.meta.url), new URL("../desktop/dist/licenses/LUCIDE.txt", import.meta.url))
console.log(`TinyCommand desktop frontend built in ${fileURLToPath(output)}`)
