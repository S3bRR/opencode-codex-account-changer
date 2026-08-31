import { createServer, type Server } from "node:http"
import { setTimeout as sleep } from "node:timers/promises"
import { identity, type OAuthCredential } from "./accounts.js"

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const ISSUER = "https://auth.openai.com"
const REDIRECT = "http://localhost:1455/auth/callback"

export type Tokens = {
  id_token?: string
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function signal(parent?: AbortSignal, timeout = 30_000) {
  const timer = AbortSignal.timeout(timeout)
  return parent ? AbortSignal.any([parent, timer]) : timer
}

async function post<T>(path: string, body: URLSearchParams | object, parent?: AbortSignal): Promise<T> {
  const json = !(body instanceof URLSearchParams)
  const response = await fetch(`${ISSUER}${path}`, {
    method: "POST",
    signal: signal(parent),
    headers: { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded" },
    body: json ? JSON.stringify(body) : body,
  })
  if (!response.ok) throw new Error(`OpenAI OAuth request failed (${response.status})`)
  return response.json() as Promise<T>
}

export function toCredential(tokens: Tokens, previous?: OAuthCredential): OAuthCredential {
  const found = identity(tokens.id_token, tokens.access_token)
  return {
    type: "oauth",
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? previous?.refresh ?? "",
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ...(found.id ?? previous?.accountId ? { accountId: found.id ?? previous?.accountId } : {}),
    ...(previous?.enterpriseUrl && { enterpriseUrl: previous.enterpriseUrl }),
  }
}

export function refresh(refreshToken: string, parent?: AbortSignal) {
  return post<Tokens>(
    "/oauth/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLIENT_ID }),
    parent,
  )
}

async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: Buffer.from(digest).toString("base64url") }
}

function page(message: string) {
  return `<!doctype html><meta charset="utf-8"><title>OpenCode</title><body><h1>${message}</h1><p>You can close this window.</p>`
}

export async function browser(parent: AbortSignal) {
  const codes = await pkce()
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
  let server: Server
  let cancel!: (error?: Error) => void
  const tokens = new Promise<Tokens>((resolve, fail) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server?.close()
      action()
    }
    const timer = setTimeout(() => finish(() => fail(new Error("Authentication timed out"))), 5 * 60_000)
    cancel = (error = new Error("Authentication cancelled")) => finish(() => fail(error))
    server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", REDIRECT)
      if (url.pathname !== "/auth/callback") return void response.writeHead(404).end()
      if (url.searchParams.get("state") !== state) return void response.writeHead(400).end(page("Invalid OAuth state"))
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error")
      const code = url.searchParams.get("code")
      if (error || !code) {
        response.writeHead(400).end(page("Authentication failed"))
        return cancel(new Error(error ?? "Missing authorization code"))
      }
      try {
        const result = await post<Tokens>(
          "/oauth/token",
          new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            code_verifier: codes.verifier,
          }),
          parent,
        )
        response.writeHead(200).end(page("Authentication complete"))
        finish(() => resolve(result))
      } catch (cause) {
        response.writeHead(500).end(page("Authentication failed"))
        cancel(cause instanceof Error ? cause : new Error("Token exchange failed"))
      }
    })
  })
  void tokens.catch(() => {})
  await new Promise<void>((resolve, fail) =>
    server!.once("error", (cause) => {
      cancel(cause)
      fail(cause)
    }).listen(1455, "localhost", resolve),
  )
  parent.addEventListener("abort", () => cancel(), { once: true })
  if (parent.aborted) cancel()
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: "openid profile email offline_access",
    code_challenge: codes.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  })
  return { url: `${ISSUER}/oauth/authorize?${query}`, tokens, cancel }
}

export async function device(parent: AbortSignal) {
  const challenge = await post<{ device_auth_id: string; user_code: string; interval: string }>(
    "/api/accounts/deviceauth/usercode",
    { client_id: CLIENT_ID },
    parent,
  )
  return {
    url: `${ISSUER}/codex/device`,
    instructions: `Enter code: ${challenge.user_code}`,
    async tokens() {
      const expires = Date.now() + 15 * 60_000
      while (Date.now() < expires) {
        const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
          method: "POST",
          signal: signal(parent),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_auth_id: challenge.device_auth_id, user_code: challenge.user_code }),
        })
        if (response.ok) {
          const code = (await response.json()) as { authorization_code: string; code_verifier: string }
          return post<Tokens>(
            "/oauth/token",
            new URLSearchParams({
              grant_type: "authorization_code",
              code: code.authorization_code,
              redirect_uri: `${ISSUER}/deviceauth/callback`,
              client_id: CLIENT_ID,
              code_verifier: code.code_verifier,
            }),
            parent,
          )
        }
        if (response.status !== 403 && response.status !== 404) throw new Error(`Device authorization failed (${response.status})`)
        await sleep(Math.max(Number(challenge.interval) || 5, 1) * 1000, undefined, { signal: parent })
      }
      throw new Error("Device authorization timed out")
    },
  }
}
