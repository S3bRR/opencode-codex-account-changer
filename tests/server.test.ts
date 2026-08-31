import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import plugin from "../src/server.js"

const originalFetch = globalThis.fetch
const originalData = process.env.XDG_DATA_HOME
const originalState = process.env.XDG_STATE_HOME
let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codex-account-changer-test-"))
  process.env.XDG_DATA_HOME = root
  process.env.XDG_STATE_HOME = root
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  if (originalData === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = originalData
  if (originalState === undefined) delete process.env.XDG_STATE_HOME
  else process.env.XDG_STATE_HOME = originalState
  await rm(root, { recursive: true, force: true })
})

function input(writes: unknown[] = []) {
  return {
    client: { auth: { set: async (value: unknown) => (writes.push(value), { data: true }) } },
    project: {},
    directory: "/tmp/project",
    worktree: "/tmp/project",
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://localhost"),
    $: {},
  } as never
}

const auth = {
  type: "oauth" as const,
  refresh: "synthetic-refresh",
  access: "synthetic-access",
  expires: Date.now() + 60_000_000,
  accountId: "account-a",
}

describe("server transport", () => {
  test("exports valid OpenCode hooks", async () => {
    const hooks = await plugin.server(input())
    expect(hooks.auth?.provider).toBe("openai")
    expect(hooks.auth?.methods).toHaveLength(3)
    await hooks.dispose?.()
  })

  test("only attaches OAuth credentials to the fixed Codex endpoint", async () => {
    const requests: Request[] = []
    globalThis.fetch = (async (request) => {
      requests.push(new Request(request))
      return new Response("ok")
    }) as typeof fetch

    const hooks = await plugin.server(input())
    const options = await hooks.auth!.loader!(async () => auth, {} as never)
    await options.fetch("https://untrusted.example/models", { headers: { Authorization: "Bearer dummy" } })
    await options.fetch("https://untrusted.example/v1/responses", { headers: { Authorization: "Bearer dummy" } })
    await options.fetch("https://api.openai.com/v1/responses")

    expect(requests[0]!.url).toBe("https://untrusted.example/models")
    expect(requests[0]!.headers.get("authorization")).toBeNull()
    expect(requests[1]!.url).toBe("https://untrusted.example/v1/responses")
    expect(requests[1]!.headers.get("authorization")).toBeNull()
    expect(requests[2]!.url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(requests[2]!.headers.get("authorization")).toBe("Bearer synthetic-access")
    expect(requests[2]!.headers.get("ChatGPT-Account-Id")).toBe("account-a")
    await hooks.dispose?.()
  })

  test("uses the selected saved account and promotes it to canonical auth", async () => {
    const dir = join(root, "opencode")
    await mkdir(dir, { recursive: true })
    const second = { ...auth, access: "second-access", refresh: "second-refresh", accountId: "account-b" }
    await writeFile(join(dir, "auth.json"), JSON.stringify({ openai: auth, "openai/account-b": second }))
    await writeFile(join(dir, "codex-account-changer.json"), JSON.stringify({ accountId: "account-b" }))

    let request: Request | undefined
    globalThis.fetch = (async (value) => {
      request = new Request(value)
      return new Response("ok")
    }) as typeof fetch
    const writes: any[] = []
    const hooks = await plugin.server(input(writes))
    const options = await hooks.auth!.loader!(async () => auth, {} as never)
    await options.fetch("https://api.openai.com/v1/responses")

    expect(request!.headers.get("authorization")).toBe("Bearer second-access")
    expect(writes).toContainEqual(expect.objectContaining({ path: { id: "openai" }, body: second }))
    await hooks.dispose?.()
  })
})
