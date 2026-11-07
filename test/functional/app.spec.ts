import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("buildApp", () => {
    it("serves the OpenAPI documentation with every route", async () => {
        const app = await buildApp({ logger: false, rateLimit: false });

        const res = await app.inject({ method: "GET", url: "/docs/openapi.json" });

        expect(res.statusCode).toBe(200);
        expect(Object.keys(res.json().paths)).toEqual(expect.arrayContaining([
            "/auth/signup", "/auth/signin", "/auth/refresh", "/auth/activate",
            "/auth/verify-email", "/auth/resend-verification",
            "/user/", "/user/admin/{id}", "/user/admin/create-user",
            "/session/", "/session/{id}", "/session/join", "/session/quit/{id}",
            "/audio/upload", "/audio/resolve", "/audio/list",
        ]));
        await app.close();
    });

    it("answers 404 on an unknown route", async () => {
        const app = await buildApp({ logger: false, rateLimit: false });

        const res = await app.inject({ method: "GET", url: "/nowhere" });

        expect(res.statusCode).toBe(404);
        await app.close();
    });

    it("limits the number of requests per IP by default", async () => {
        const app = await buildApp({ logger: false });

        const statuses: number[] = [];
        for (let i = 0; i < 30; i++) {
            const res = await app.inject({ method: "POST", url: "/auth/signin", payload: {} });
            statuses.push(res.statusCode);
        }

        expect(statuses.every((status) => status === 400)).toBe(true);
        const limited = await app.inject({ method: "POST", url: "/auth/signin", payload: {} });
        expect(limited.statusCode).toBe(429);
        expect(limited.json()).toMatchObject({ statusCode: 429, error: "Too Many Requests" });
        expect(limited.json().message).toMatch(/^Rate limit exceeded\. Retry in .+ seconds$/);
        await app.close();
    });

    it("accepts a custom rate limit", async () => {
        const app = await buildApp({ logger: false, rateLimit: { max: 1, timeWindow: "1 minute" } });

        await app.inject({ method: "POST", url: "/auth/signin", payload: {} });
        const res = await app.inject({ method: "POST", url: "/auth/signin", payload: {} });

        expect(res.statusCode).toBe(429);
        await app.close();
    });
});
