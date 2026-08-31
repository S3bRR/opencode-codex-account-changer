import { type OAuthCredential } from "./accounts.js";
export type Tokens = {
    id_token?: string;
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
};
export declare function toCredential(tokens: Tokens, previous?: OAuthCredential): OAuthCredential;
export declare function refresh(refreshToken: string, parent?: AbortSignal): Promise<Tokens>;
export declare function browser(parent: AbortSignal): Promise<{
    url: string;
    tokens: Promise<Tokens>;
    cancel: (error?: Error) => void;
}>;
export declare function device(parent: AbortSignal): Promise<{
    url: string;
    instructions: string;
    tokens(): Promise<Tokens>;
}>;
