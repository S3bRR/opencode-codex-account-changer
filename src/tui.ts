import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { readAccounts, readSelection, writeSelection } from "./accounts.js"

const tui: TuiPlugin = async (api) => {
  const baseUrl = (api.client as unknown as { client?: { getConfig(): { baseUrl?: string } } }).client?.getConfig().baseUrl
  const local = (() => {
    try {
      return ["localhost", "127.0.0.1", "::1"].includes(new URL(baseUrl ?? "").hostname)
    } catch {
      return false
    }
  })()

  async function open() {
    try {
      if (!local) {
        api.ui.dialog.replace(() =>
          api.ui.DialogAlert({
            title: "Codex accounts",
            message: "Account switching is unavailable when attached to a remote OpenCode server.",
          }),
        )
        return
      }
      const accounts = await readAccounts()
      const selected = await readSelection()
      if (!accounts.length) {
        api.ui.dialog.replace(() =>
          api.ui.DialogAlert({ title: "Codex accounts", message: "No saved accounts. Use /connect to add one." }),
        )
        return
      }
      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: "Switch Codex account",
          current: selected ?? accounts.find((account) => account.active)?.id,
          options: accounts.map((account) => ({
            title: account.label,
            description: account.id === (selected ?? accounts.find((item) => item.active)?.id) ? "Active" : undefined,
            value: account.id,
          })),
          onSelect: (option) => {
            if (!accounts.some((account) => account.id === option.value)) return
            void writeSelection(String(option.value)).then(
              () => api.ui.dialog.clear(),
              (cause) =>
                api.ui.dialog.replace(() =>
                  api.ui.DialogAlert({
                    title: "Codex accounts",
                    message: cause instanceof Error ? cause.message : "Unable to switch accounts.",
                  }),
                ),
            )
          },
        }),
      )
    } catch (cause) {
      api.ui.dialog.replace(() =>
        api.ui.DialogAlert({
          title: "Codex accounts",
          message: cause instanceof Error ? cause.message : "Unable to read saved accounts.",
        }),
      )
    }
  }

  api.lifecycle.onDispose(
    api.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",
          name: "codex.accounts.switch",
          title: "Switch Codex account",
          category: "Codex",
          slashName: "accounts",
          run: open,
        },
      ],
      bindings: [],
    }),
  )
}

export default { id: "codex-account-changer", tui } satisfies TuiPluginModule
