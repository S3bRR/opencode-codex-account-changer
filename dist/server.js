import { credential, readAccounts, readSelection, writeSelection } from "./accounts.js";
import { browser, device, refresh, toCredential } from "./oauth.js";
const CODEX = "https://chatgpt.com/backend-api/codex/responses";
const OPENAI_ORIGINS = new Set(["https://api.openai.com", "https://chatgpt.com"]);
function request(source, url, headers) {
    const body = source.method === "GET" || source.method === "HEAD" ? undefined : source.body;
    return new Request(url, {
        method: source.method,
        headers,
        body,
        signal: source.signal,
        redirect: source.redirect,
        ...(body && { duplex: "half" }),
    });
}
const server = async (input) => {
    const lifecycle = new AbortController();
    let browserFlow;
    async function setAuth(id, auth) {
        await input.client.auth.set({ path: { id }, body: auth, throwOnError: true });
    }
    async function save(auth) {
        if (!auth.accountId)
            throw new Error("OpenAI did not return a ChatGPT account ID");
        await setAuth(`openai/${auth.accountId}`, auth);
        return auth;
    }
    async function success(tokens) {
        const auth = await save(toCredential(tokens));
        await writeSelection(auth.accountId);
        return {
            type: "success",
            refresh: auth.refresh,
            access: auth.access,
            expires: auth.expires,
            accountId: auth.accountId,
            enterpriseUrl: auth.enterpriseUrl,
        };
    }
    return {
        async dispose() {
            lifecycle.abort();
            browserFlow?.cancel();
        },
        auth: {
            provider: "openai",
            async loader(getAuth) {
                if (!credential(await getAuth()))
                    return {};
                const refreshing = new Map();
                return {
                    apiKey: "opencode-oauth-dummy-key",
                    async fetch(input, init) {
                        const source = new Request(input, init);
                        const headers = new Headers(source.headers);
                        headers.delete("authorization");
                        const url = new URL(source.url);
                        if (!OPENAI_ORIGINS.has(url.origin) ||
                            (url.pathname !== "/v1/responses" &&
                                url.pathname !== "/chat/completions" &&
                                url.pathname !== "/v1/chat/completions")) {
                            return fetch(request(source, source.url, headers));
                        }
                        let auth;
                        let selected;
                        try {
                            const accounts = await readAccounts();
                            selected = await readSelection();
                            auth = accounts.find((account) => account.id === selected)?.auth ?? accounts.find((account) => account.active)?.auth;
                        }
                        catch { }
                        const canonical = credential(await getAuth());
                        auth ??= canonical;
                        if (!auth)
                            return fetch(request(source, source.url, headers));
                        if (!auth.access || auth.expires <= Date.now() + 60_000) {
                            const id = auth.accountId ?? auth.refresh;
                            let pending = refreshing.get(id);
                            if (!pending) {
                                pending = refresh(auth.refresh, lifecycle.signal)
                                    .then((tokens) => save(toCredential(tokens, auth)))
                                    .finally(() => refreshing.delete(id));
                                refreshing.set(id, pending);
                            }
                            auth = await pending;
                        }
                        const canonicalChanged = canonical !== undefined &&
                            canonical.accountId === auth.accountId &&
                            (canonical.access !== auth.access || canonical.refresh !== auth.refresh || canonical.expires !== auth.expires);
                        const selectionChanged = selected !== undefined && auth.accountId === selected && (await readSelection().catch(() => undefined)) === selected;
                        if (canonicalChanged || selectionChanged)
                            await setAuth("openai", auth);
                        headers.set("authorization", `Bearer ${auth.access}`);
                        if (auth.accountId)
                            headers.set("ChatGPT-Account-Id", auth.accountId);
                        return fetch(request(source, CODEX, headers));
                    },
                };
            },
            methods: [
                {
                    label: "ChatGPT Pro/Plus (browser, saves account)",
                    type: "oauth",
                    async authorize() {
                        browserFlow?.cancel();
                        const flow = await browser(lifecycle.signal);
                        browserFlow = flow;
                        return {
                            url: flow.url,
                            instructions: "Complete authorization in your browser.",
                            method: "auto",
                            callback: async () => success(await flow.tokens),
                        };
                    },
                },
                {
                    label: "ChatGPT Pro/Plus (headless, saves account)",
                    type: "oauth",
                    async authorize() {
                        const flow = await device(lifecycle.signal);
                        return {
                            url: flow.url,
                            instructions: flow.instructions,
                            method: "auto",
                            callback: async () => success(await flow.tokens()),
                        };
                    },
                },
                { label: "Manually enter API Key", type: "api" },
            ],
        },
    };
};
export default { id: "codex-account-changer", server };
