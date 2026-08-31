# OpenCode Codex Account Changer

Switch between multiple ChatGPT Plus/Pro OAuth accounts in OpenCode.

Supports OpenCode CLI on macOS, Linux, and Windows with zero runtime dependencies.

## Install

Add the plugin to both OpenCode configuration files.

`~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["github:S3bRR/opencode-codex-account-changer#v1.0.2"]
}
```

`~/.config/opencode/tui.json`:

```json
{
  "plugin": ["github:S3bRR/opencode-codex-account-changer#v1.0.2"]
}
```

Restart OpenCode. Run `/connect` once for each ChatGPT account, then use `/accounts` to switch accounts mid session.

## Existing Accounts

The plugin recognizes OpenCode's canonical `openai` OAuth credential, `openai/*` account entries, and legacy `OpenAI (...)` entries. It never deletes credentials.

## Security

- Credentials remain in OpenCode's standard `auth.json`.
- The account picker stores only the selected non-secret account ID.
- Tokens are never logged.
- OAuth binds only to `localhost`.
- Bearer tokens are sent only to OpenAI's fixed Codex endpoint.

## Compatibility

Version `1.0.2` supports OpenCode `>=1.18.25 <1.19.0`. Account switching is not supported through `opencode attach`.

MIT licensed.
