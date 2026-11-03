import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ApiClient, audioForm, signUpAndSignIn, startTestServer, type TestServer } from "../helpers/http.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { Session } from "../../src/infrastructure/db/entities/session.entity.js";
import { AudioTrack } from "../../src/infrastructure/db/entities/audioTrack.entity.js";
import { MinioStorageService } from "../../src/infrastructure/storage/MinioStorageService.js";

let server: TestServer;
let api: ApiClient;

beforeAll(async () => {
    server = await startTestServer();
    api = new ApiClient(server.baseUrl);
});

afterAll(async () => {
    await server.close();
});

describe("game session", () => {
    it("is created, joined, quit and closed by its owner", async () => {
        const owner = await signUpAndSignIn(api, "owner");
        const player = await signUpAndSignIn(api, "player");

        const created = await owner.client.post("/session", { sessionName: "Campaign" });
        expect(created.status).toBe(201);
        expect(created.body.inviteCode).toMatch(/^[A-Za-z0-9]{6}$/);
        expect((await owner.client.post("/session", { sessionName: "Second" })).status).toBe(400);

        const joined = await player.client.post("/session/join", { inviteCode: created.body.inviteCode });
        expect(joined.status).toBe(200);
        expect(joined.body.sessionMembers.map((m: { id: number }) => m.id).sort()).toEqual([owner.id, player.id].sort());
        expect((await player.client.post("/session/join", { inviteCode: created.body.inviteCode })).status).toBe(400);
        expect((await player.client.post("/session/join", { inviteCode: "ZZZZZZ" })).status).toBe(400);

        expect((await player.client.delete(`/session/${created.body.id}`)).status).toBe(400);
        const quit = await player.client.post(`/session/quit/${created.body.id}`, {});
        expect(quit.status).toBe(200);
        expect(quit.body.sessionMembers.map((m: { id: number }) => m.id)).toEqual([owner.id]);

        expect((await owner.client.post(`/session/quit/${created.body.id}`, {})).status).toBe(400);
        expect((await owner.client.post(`/session/quit/${created.body.id}`, { forceDelete: true })).status).toBe(200);
        expect(await AppDataSource.getRepository(Session).countBy({ id: created.body.id })).toBe(0);
    });
});

describe("sound library", () => {
    it("uploads, lists and draws sounds while keeping private sounds private", async () => {
        const host = await signUpAndSignIn(api, "host");
        const other = await signUpAndSignIn(api, "other");
        const forestCalm = { zone: "forest", ambiance: "calm" };

        const publicMusic = await host.client.post("/audio/upload", audioForm({ name: "Public music", type: "music", ...forestCalm, isUserImported: false }));
        expect(publicMusic.status).toBe(200);
        expect(publicMusic.body.key).toMatch(/^sounds\/0\//);
        const hostMusic = await host.client.post("/audio/upload", audioForm({ name: "Host music", type: "music", ...forestCalm, isUserImported: true }));
        expect(hostMusic.body.key).toMatch(new RegExp(`^sounds/${host.id}/`));
        const hostEnvironment = await host.client.post("/audio/upload", audioForm({ name: "Host rain", type: "environment", ...forestCalm, isUserImported: true }));
        const otherEnvironment = await other.client.post("/audio/upload", audioForm({ name: "Other rain", type: "environment", ...forestCalm, isUserImported: true }));
        expect(otherEnvironment.status).toBe(200);

        const objects = await MinioStorageService.getInstance().listByPrefix("sounds/");
        expect(objects).toEqual(expect.arrayContaining([publicMusic.body.key, hostMusic.body.key, hostEnvironment.body.key, otherEnvironment.body.key]));

        const duplicate = await host.client.post("/audio/upload", audioForm({ name: "Again", type: "music", ...forestCalm, isUserImported: true }, hostMusic.body.key.split("/")[2]));
        expect(duplicate.status).toBe(400);
        expect((await host.client.post("/audio/upload", audioForm({ name: "Bad", type: "zone", ...forestCalm, isUserImported: true }))).status).toBe(400);

        const hostList = await host.client.post("/audio/list", { zone: "forest" });
        expect(hostList.status).toBe(200);
        expect(hostList.body.total).toBe(3);
        expect(hostList.body.data.map((s: { key: string }) => s.key)).not.toContain(otherEnvironment.body.key);
        expect((await host.client.post("/audio/list", { type: "music", limit: 1 })).body).toMatchObject({ total: 2 });
        expect((await host.client.post("/audio/list", { zone: "volcanic" })).body).toEqual({ data: [], total: 0 });

        const session = await host.client.post("/session", { sessionName: "Forest night" });
        const draws = [];
        for (let i = 0; i < 4; i++) {
            const draw = await host.client.post("/audio/resolve", { sessionId: session.body.id, zone: "forest" });
            expect(draw.status).toBe(200);
            draws.push(draw.body);
        }
        expect(draws.every((d) => d.environment.key === hostEnvironment.body.key)).toBe(true);
        expect(draws[0].music.key).not.toBe(draws[1].music.key);
        expect([draws[0].music.key, draws[1].music.key].sort()).toEqual([publicMusic.body.key, hostMusic.body.key].sort());

        expect((await other.client.post("/audio/resolve", { sessionId: session.body.id, zone: "forest" })).status).toBe(400);
        expect((await host.client.post("/audio/resolve", { sessionId: session.body.id })).status).toBe(400);
        expect((await host.client.post("/audio/resolve", { sessionId: session.body.id, zone: "volcanic" })).status).toBe(400);

        expect((await other.client.delete("/user")).status).toBe(200);
        const remaining = await MinioStorageService.getInstance().listByPrefix("sounds/");
        expect(remaining).not.toContain(otherEnvironment.body.key);
        expect(remaining).toContain(hostMusic.body.key);
        expect(await AppDataSource.getRepository(AudioTrack).countBy({ storageKey: otherEnvironment.body.key })).toBe(0);
    });
});
