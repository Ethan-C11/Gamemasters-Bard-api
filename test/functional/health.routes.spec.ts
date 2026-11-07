import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/app.js";
import { buildApp } from "../../src/app.js";
import { CheckHealthUseCase } from "../../src/application/useCases/health/CheckHealthUseCase.js";

const healthy = { status: "ok", checks: { database: "up", storage: "up" } };
const degraded = { status: "degraded", checks: { database: "down", storage: "up" } };

describe("GET /health", () => {
    it("answers 200 without authentication when everything is up", async () => {
        const app = await createTestApp();
        vi.spyOn(CheckHealthUseCase.getInstance(), "execute").mockResolvedValueOnce(healthy);

        const res = await app.inject({ method: "GET", url: "/health" });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(healthy);
        await app.close();
    });

    it("answers 503 with the failing checks when a dependency is down", async () => {
        const app = await createTestApp();
        vi.spyOn(CheckHealthUseCase.getInstance(), "execute").mockResolvedValueOnce(degraded);

        const res = await app.inject({ method: "GET", url: "/health" });

        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual(degraded);
        await app.close();
    });

    it("is not limited by the global rate limit", async () => {
        const app = await buildApp({ logger: false, rateLimit: { max: 2, timeWindow: "1 minute" } });
        vi.spyOn(CheckHealthUseCase.getInstance(), "execute").mockResolvedValue(healthy);

        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push((await app.inject({ method: "GET", url: "/health" })).statusCode);
        const other: number[] = [];
        for (let i = 0; i < 4; i++) other.push((await app.inject({ method: "POST", url: "/auth/logout", payload: { refreshToken: "raw" } })).statusCode);

        expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
        expect(other).toContain(429);
        await app.close();
    });
});
