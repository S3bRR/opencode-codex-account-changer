import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type OAuthCredential = {
  type: "oauth"
  refresh: string
  access: string
  expires: number
  accountId?: string
  enterpriseUrl?: string
}

export type Account = {
  id: string
  label: string
  active: boolean
  auth: OAuthCredential
}

type Claims = {
  email?: string
  chatgpt_account_id?: string
  organizations?: Array<{ id?: string }>
  "https://api.openai.com/auth"?: { chatgpt_account_id?: string; user_email?: string }
  "https://api.openai.com/profile"?: { email?: string }
}

function claims(token: string | undefined): Claims {
  try {
    const body = token?.split(".")[1]
    return body ? JSON.parse(Buffer.from(body, "base64url").toString()) : {}
  } catch {
    return {}
  }
}

export function identity(...tokens: Array<string | undefined>) {
  let id: string | undefined
  let email: string | undefined
  for (const token of tokens) {
    const value = claims(token)
    id ??=
      value.chatgpt_account_id ??
      value["https://api.openai.com/auth"]?.chatgpt_account_id ??
      value.organizations?.[0]?.id
    email ??=
      value.email ?? value["https://api.openai.com/profile"]?.email ?? value["https://api.openai.com/auth"]?.user_email
  }
  return { id, email }
}

export function credential(value: unknown): OAuthCredential | undefined {
  if (!value || typeof value !== "object") return
  const row = value as Record<string, unknown>
  if (
    row.type !== "oauth" ||
    typeof row.refresh !== "string" ||
    typeof row.access !== "string" ||
    typeof row.expires !== "number"
  )
    return
  return {
    type: "oauth",
    refresh: row.refresh,
    access: row.access,
    expires: row.expires,
    ...(typeof row.accountId === "string" && { accountId: row.accountId }),
    ...(typeof row.enterpriseUrl === "string" && { enterpriseUrl: row.enterpriseUrl }),
  }
}

function managed(key: string) {
  return key === "openai" || key.startsWith("openai/") || (key.startsWith("OpenAI (") && key.endsWith(")"))
}

function keyLabel(key: string) {
  if (key.startsWith("openai/")) return key.slice(7)
  if (key.startsWith("OpenAI (") && key.endsWith(")")) return key.slice(8, -1)
  return "OpenAI"
}

export function parseAccounts(value: unknown): Account[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("auth.json is not a JSON object")
  const rows = Object.entries(value as Record<string, unknown>)
  const canonical = credential(rows.find(([key]) => key === "openai")?.[1])
  const active = canonical && (canonical.accountId ?? identity(canonical.access).id ?? "openai")
  const accounts = new Map<string, Account>()

  for (const [key, raw] of rows
    .filter(([key]) => managed(key))
    .sort(([a], [b]) => Number(a === "openai") - Number(b === "openai"))) {
    const auth = credential(raw)
    if (!auth) continue
    const found = identity(auth.access)
    const id = auth.accountId ?? found.id ?? key
    const next = { id, label: found.email ?? keyLabel(key) ?? id, active: id === active, auth }
    const previous = accounts.get(id)
    if (!previous || auth.expires > previous.auth.expires || (previous.label === "OpenAI" && next.label !== "OpenAI")) {
      accounts.set(id, next)
    }
  }

  return [...accounts.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label))
}

export function authPath() {
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "auth.json")
}

export function selectionPath() {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
    "opencode",
    "codex-account-changer.json",
  )
}

export async function readAccounts(file = authPath()) {
  return parseAccounts(JSON.parse(await readFile(file, "utf8")))
}

export async function readSelection(file = selectionPath()) {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as { accountId?: unknown }
    return typeof value.accountId === "string" ? value.accountId : undefined
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return
    throw cause
  }
}

export async function writeSelection(accountId: string, file = selectionPath()) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify({ accountId }), { mode: 0o600 })
  await rename(temporary, file)
}
