import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { $ } from "bun"

const dir = await mkdtemp(join(tmpdir(), "codex-account-changer-"))
const packed = (await $`npm pack --silent --pack-destination ${dir}`.text()).trim()
if (!packed.endsWith(".tgz")) throw new Error("npm pack did not create an archive")
await $`tar -xzf ${join(dir, packed)} -C ${dir}`
const serverModule = await import(join(dir, "package", "dist", "server.js"))
const tuiModule = await import(join(dir, "package", "dist", "tui.js"))
if (typeof serverModule.default?.server !== "function" || typeof tuiModule.default?.tui !== "function") {
  throw new Error("Built plugin entrypoints are invalid")
}
await rm(dir, { recursive: true, force: true })
