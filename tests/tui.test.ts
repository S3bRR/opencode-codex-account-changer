import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import plugin from "../src/tui.js"

const originalData = process.env.XDG_DATA_HOME
const originalState = process.env.XDG_STATE_HOME
let root = ""

afterEach(async () => {
  if (originalData === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = originalData
  if (originalState === undefined) delete process.env.XDG_STATE_HOME
  else process.env.XDG_STATE_HOME = originalState
  await rm(root, { recursive: true, force: true })
})

describe("TUI plugin", () => {
  test("registers /accounts and persists only the selected account ID", async () => {
    root = await mkdtemp(join(tmpdir(), "codex-account-changer-tui-"))
    process.env.XDG_DATA_HOME = root
    process.env.XDG_STATE_HOME = root
    const dir = join(root, "opencode")
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, "auth.json"),
      JSON.stringify({
        "openai/account-a": {
          type: "oauth",
          refresh: "synthetic-refresh",
          access: "synthetic-access",
          expires: Date.now() + 60_000,
          accountId: "account-a",
        },
      }),
    )

    let layer: any
    let select: any
    const api = {
      keymap: { registerLayer(value: any) { layer = value } },
      lifecycle: { onDispose() {} },
      ui: {
        dialog: { replace(render: () => unknown) { render() }, clear() {} },
        DialogAlert: (props: unknown) => props,
        DialogSelect: (props: unknown) => (select = props),
      },
    }

    await plugin.tui(api as never)
    expect(layer.commands[0].slashName).toBe("accounts")
    await layer.commands[0].run()
    select.onSelect(select.options[0])
    await Bun.sleep(10)
    expect(JSON.parse(await readFile(join(root, "opencode", "codex-account-changer.json"), "utf8"))).toEqual({
      accountId: "account-a",
    })
  })
})
