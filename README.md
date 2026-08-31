# OpenCode Codex Account Changer

Fast, safe ChatGPT OAuth account switching for OpenCode `1.18.25`.

## Features

- `/accounts` account picker in the OpenCode TUI
- Saves every successful ChatGPT OAuth login instead of overwriting the previous account
- Keeps rotated access and refresh tokens synchronized
- Uses OpenCode's auth API for every credential write
- Never logs tokens, prompts, or account contents
- Zero runtime dependencies

## Install

Add the package to both OpenCode configuration files:

`~/.config/opencode/opencode.json`

```json
{
  "plugin": ["opencode-codex-account-changer@1.0.0"]
}
```

`~/.config/opencode/tui.json`

```json
{
  "plugin": ["opencode-codex-account-changer@1.0.0"]
}
```

Restart OpenCode. Use `/connect` to add ChatGPT accounts and `/accounts` to switch between them.

Account switching is intentionally unavailable in `opencode attach` sessions because OpenCode does not expose remote credential discovery to TUI plugins.

The plugin also recognizes account entries created by `@insd47/opencode-codex` under `openai/*` and legacy `OpenAI (...)` keys. It never deletes those entries.

OpenCode still requires a canonical `openai` OAuth credential to initialize the provider. A normal `/connect` login creates it automatically.

## Security

Credentials stay in OpenCode's standard `auth.json`. The TUI persists only a non-secret account ID; the server resolves that ID against its own local credentials. Credential updates go through OpenCode's SDK, OAuth binds only to `localhost`, and bearer tokens are attached only to requests rewritten to OpenAI's fixed Codex endpoint.

Do not commit `auth.json`, logs, screenshots, or diagnostic output when reporting issues.

## Development

```sh
npm install
npm run verify
```

The test suite uses synthetic credentials only.

## Compatibility

Version `1.0.0` targets OpenCode `>=1.18.25 <1.19.0`. Pinning the supported range prevents silent breakage when OpenCode changes its plugin API.

## License

MIT
