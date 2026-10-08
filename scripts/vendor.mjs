import { copyFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const from = join(root, "node_modules/three/build/three.module.js")
const to = join(root, "site/vendor/three.module.js")
await mkdir(dirname(to), { recursive: true })
await copyFile(from, to)
console.log("vendored", to)
