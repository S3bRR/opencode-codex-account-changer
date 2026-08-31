export type OAuthCredential = {
    type: "oauth";
    refresh: string;
    access: string;
    expires: number;
    accountId?: string;
    enterpriseUrl?: string;
};
export type Account = {
    id: string;
    label: string;
    active: boolean;
    auth: OAuthCredential;
};
export declare function identity(...tokens: Array<string | undefined>): {
    id: string | undefined;
    email: string | undefined;
};
export declare function credential(value: unknown): OAuthCredential | undefined;
export declare function parseAccounts(value: unknown): Account[];
export declare function authPath(): string;
export declare function selectionPath(): string;
export declare function readAccounts(file?: string): Promise<Account[]>;
export declare function readSelection(file?: string): Promise<string | undefined>;
export declare function writeSelection(accountId: string, file?: string): Promise<void>;
