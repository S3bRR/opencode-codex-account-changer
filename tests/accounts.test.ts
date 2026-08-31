import { describe, expect, test } from "bun:test"
import { identity, parseAccounts } from "../src/accounts.js"

function token(id: string, email: string) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "none" })}.${part({ chatgpt_account_id: id, email })}.signature`
}

function auth(id: string, email: string, expires = 100) {
  return { type: "oauth", refresh: `refresh-${id}`, access: token(id, email), expires, accountId: id }
}

describe("parseAccounts", () => {
  test("discovers named and legacy credentials and marks the canonical account active", () => {
    const accounts = parseAccounts({
      "openai/account-a": auth("account-a", "first@example.test"),
      "OpenAI (second@example.test)": auth("account-b", "second@example.test"),
      openai: auth("account-b", "second@example.test", 200),
      anthropic: { type: "api", key: "not-managed" },
    })

    expect(accounts).toHaveLength(2)
    expect(accounts.map(({ id }) => id).sort()).toEqual(["account-a", "account-b"])
    expect(accounts[0]).toMatchObject({ id: "account-b", label: "second@example.test", active: true })
  })

  test("ignores malformed credentials and rejects an invalid root", () => {
    expect(parseAccounts({ openai: { type: "oauth", access: 1 } })).toEqual([])
    expect(() => parseAccounts([])).toThrow("auth.json is not a JSON object")
  })

  test("combines email-only ID token claims with an account ID from the access token", () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
    const jwt = (value: object) => `${part({ alg: "none" })}.${part(value)}.signature`
    expect(identity(jwt({ email: "user@example.test" }), jwt({ chatgpt_account_id: "account-a" }))).toEqual({
      id: "account-a",
      email: "user@example.test",
    })
  })
})
