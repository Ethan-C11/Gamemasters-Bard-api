import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ApiClient, audioForm, signUpAndSignIn, startTestServer, type TestServer } from "../helpers/http.js";
import { measure, printLatencyReport } from "../helpers/latency.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { AudioTrack } from "../../src/infrastructure/db/entities/audioTrack.entity.js";
import { SoundType } from "../../src/shared/enums/SoundType.js";
import { Zone } from "../../src/shared/enums/Zone.js";
import { Ambiance } from "../../src/shared/enums/Ambiance.js";

let server: TestServer;
let api: ApiClient;
let user: Awaited<ReturnType<typeof signUpAndSignIn>>;
let sessionId: number;
const password = "password123";

beforeAll(async () => {
    server = await startTestServer();
    api = new ApiClient(server.baseUrl);
    user = await signUpAndSignIn(api, "latency", password);

    const zones = [Zone.FOREST, Zone.CAVE, Zone.CITY];
    const tracks = AppDataSource.getRepository(AudioTrack);
    await tracks.save(Array.from({ length: 90 }, (_, i) => tracks.create({
        name: `Seed ${i}`,
        storageKey: `sounds/0/seed-${i}.mp3`,
        mimeType: "audio/mpeg",
        sizeInBytes: 1000,
        type: i % 2 === 0 ? SoundType.MUSIC : SoundType.ENVIRONMENT,
        zone: zones[i % zones.length] as Zone,
        ambiance: Ambiance.CALM,
        uploadedBy: null,
        isUserImported: false,
    })));

    sessionId = (await user.client.post("/session", { sessionName: "Latency" })).body.id;
});

afterAll(async () => {
    printLatencyReport();
    await server.close();
});

describe("route latency (p95)", () => {
    it("POST /auth/signin", async () => {
        const stats = await measure("POST /auth/signin", 400, async () => {
            const res = await api.post("/auth/signin", { email: user.email, password });
            expect(res.status).toBe(200);
        }, { iterations: 20 });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /auth/refresh", async () => {
        let refreshToken = user.refreshToken;
        const stats = await measure("POST /auth/refresh", 150, async () => {
            const res = await api.post("/auth/refresh", { refreshToken });
            expect(res.status).toBe(200);
            refreshToken = res.body.refreshToken;
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /auth/logout", async () => {
        const { refreshToken } = await signUpAndSignIn(api, "latency-logout", password);
        const stats = await measure("POST /auth/logout", 150, async () => {
            const res = await api.post("/auth/logout", { refreshToken });
            expect(res.status).toBe(200);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /auth/verify-email", async () => {
        const stats = await measure("POST /auth/verify-email", 150, async () => {
            const res = await api.post("/auth/verify-email", { token: "unknown" });
            expect(res.status).toBe(400);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /auth/resend-verification", async () => {
        const stats = await measure("POST /auth/resend-verification", 150, async () => {
            const res = await api.post("/auth/resend-verification", { email: user.email });
            expect(res.status).toBe(200);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /auth/forgot-password", async () => {
        const stats = await measure("POST /auth/forgot-password", 150, async () => {
            const res = await api.post("/auth/forgot-password", { email: user.email });
            expect(res.status).toBe(200);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("PUT /user", async () => {
        const stats = await measure("PUT /user", 150, async (i) => {
            const res = await user.client.put("/user", { username: `latency${Math.abs(i)}` });
            expect(res.status).toBe(200);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /audio/list", async () => {
        const stats = await measure("POST /audio/list", 150, async () => {
            const res = await user.client.post("/audio/list", { zone: "forest", limit: 20 });
            expect(res.status).toBe(200);
            expect(res.body.total).toBe(30);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /audio/resolve", async () => {
        const stats = await measure("POST /audio/resolve", 150, async () => {
            const res = await user.client.post("/audio/resolve", { sessionId, zone: "forest" });
            expect(res.status).toBe(200);
        });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });

    it("POST /audio/upload (100 KB)", async () => {
        const stats = await measure("POST /audio/upload (100 KB)", 300, async () => {
            const res = await user.client.post("/audio/upload", audioForm({ name: "Upload", type: "music", zone: "cave", ambiance: "calm", isUserImported: true }, undefined, 100_000));
            expect(res.status).toBe(200);
        }, { iterations: 20, warmup: 3 });

        expect(stats.p95).toBeLessThan(stats.budgetP95);
    });
});
