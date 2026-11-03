import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { buildApp, type App } from "../../src/app.js";

export interface TestServer {
    app: App;
    baseUrl: string;
    close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
    const app = await buildApp({ logger: false, rateLimit: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    return { app, baseUrl: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export interface HttpResult<T = any> {
    status: number;
    body: T;
}

export class ApiClient {
    constructor(private readonly baseUrl: string, public token?: string) {}

    withToken(token: string): ApiClient {
        return new ApiClient(this.baseUrl, token);
    }

    async request<T = any>(method: string, path: string, payload?: unknown): Promise<HttpResult<T>> {
        const headers: Record<string, string> = {};
        if (this.token) headers.authorization = `Bearer ${this.token}`;
        let body: BodyInit | undefined;
        if (payload instanceof FormData) body = payload;
        else if (payload !== undefined) {
            headers["content-type"] = "application/json";
            body = JSON.stringify(payload);
        }
        const res = await fetch(this.baseUrl + path, { method, headers, body });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : undefined };
    }

    post<T = any>(path: string, payload?: unknown) { return this.request<T>("POST", path, payload ?? {}); }
    put<T = any>(path: string, payload?: unknown) { return this.request<T>("PUT", path, payload ?? {}); }
    delete<T = any>(path: string) { return this.request<T>("DELETE", path); }
}

export function uniqueEmail(prefix = "user"): string {
    return `${prefix}-${randomBytes(4).toString("hex")}@gm-test.test`;
}

export function audioForm(fields: Record<string, string | boolean>, filename = `${randomBytes(4).toString("hex")}.mp3`, size = 2048): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    form.append("file", new Blob([randomBytes(size)], { type: "audio/mpeg" }), filename);
    return form;
}

export async function signUpAndSignIn(api: ApiClient, prefix = "user", password = "password123"): Promise<{ client: ApiClient; id: number; email: string; refreshToken: string }> {
    const email = uniqueEmail(prefix);
    const signup = await api.post("/auth/signup", { email, username: prefix, password });
    if (signup.status !== 201) throw new Error(`signup failed: ${signup.status} ${JSON.stringify(signup.body)}`);
    const signin = await api.post("/auth/signin", { email, password });
    return { client: api.withToken(signin.body.token), id: signin.body.user.id, email, refreshToken: signin.body.refreshToken };
}
