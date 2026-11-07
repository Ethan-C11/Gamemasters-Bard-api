import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import type { Socket } from "socket.io-client";
import { ApiClient, audioForm, signUpAndSignIn, startTestServer, type TestServer } from "../helpers/http.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { Session } from "../../src/infrastructure/db/entities/session.entity.js";
import { AudioTrack } from "../../src/infrastructure/db/entities/audioTrack.entity.js";
import { connectSocket, emitWithAck, expectNoEvent, waitForEvent } from "../helpers/socket.js";
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

describe("session state", () => {
    it("is kept after each draw and readable by the owner and the members only", async () => {
        const host = await signUpAndSignIn(api, "state-host");
        const player = await signUpAndSignIn(api, "state-player");
        const stranger = await signUpAndSignIn(api, "state-stranger");
        const forestCalm = { zone: "forest", ambiance: "calm", isUserImported: true };

        expect((await host.client.post("/audio/upload", audioForm({ name: "State music", type: "music", ...forestCalm }))).status).toBe(200);
        expect((await host.client.post("/audio/upload", audioForm({ name: "State rain", type: "environment", ...forestCalm }))).status).toBe(200);
        const session = await host.client.post("/session", { sessionName: "State" });
        await player.client.post("/session/join", { inviteCode: session.body.inviteCode });
        const url = `/session/${session.body.id}/state`;

        const empty = await host.client.request("GET", url);
        expect(empty.status).toBe(200);
        expect(empty.body).toEqual({ music: null, environment: null, zone: null, ambiance: null, startedAt: null, status: "stopped", positionMs: 0 });

        const draw = await host.client.post("/audio/resolve", { sessionId: session.body.id, zone: "forest", ambiance: "calm" });
        expect(draw.status).toBe(200);

        const asOwner = await host.client.request("GET", url);
        const asMember = await player.client.request("GET", url);
        expect(asOwner.status).toBe(200);
        expect(asOwner.body).toMatchObject({ music: draw.body.music, environment: draw.body.environment, zone: "forest", ambiance: "calm", status: "playing", positionMs: 0 });
        expect(new Date(asOwner.body.startedAt).getTime()).toBeLessThanOrEqual(Date.now());
        expect(asMember.body).toEqual(asOwner.body);

        expect((await stranger.client.request("GET", url)).status).toBe(400);
        expect((await host.client.request("GET", `/session/${session.body.id + 1000}/state`)).status).toBe(400);
        expect((await api.request("GET", url)).status).toBe(401);

        await AppDataSource.getRepository(AudioTrack).delete({ storageKey: draw.body.music.key });
        const afterDelete = await host.client.request("GET", url);
        expect(afterDelete.status).toBe(200);
        expect(afterDelete.body.music).toBeNull();
        expect(afterDelete.body.environment).toEqual(draw.body.environment);
    });
});

describe("realtime session", () => {
    const sockets: Socket[] = [];

    async function connect(token?: string): Promise<Socket> {
        const socket = await connectSocket(server.baseUrl, token);
        sockets.push(socket);
        return socket;
    }

    afterEach(() => {
        while (sockets.length) sockets.pop()?.close();
    });

    it("keeps the owner and the members in sync and lets a reconnecting client resume", async () => {
        const host = await signUpAndSignIn(api, "rt-host");
        const player = await signUpAndSignIn(api, "rt-player");
        const stranger = await signUpAndSignIn(api, "rt-stranger");
        const forestCalm = { zone: "forest", ambiance: "calm", isUserImported: true };
        await host.client.post("/audio/upload", audioForm({ name: "Realtime music", type: "music", ...forestCalm }));
        const session = await host.client.post("/session", { sessionName: "Realtime" });
        await player.client.post("/session/join", { inviteCode: session.body.inviteCode });
        const target = { sessionId: session.body.id };

        const hostSocket = await connect(host.client.token);
        const playerSocket = await connect(player.client.token);
        const strangerSocket = await connect(stranger.client.token);

        const hostJoin = await emitWithAck(hostSocket, "session:join", target);
        expect(hostJoin).toEqual({ ok: true, state: expect.objectContaining({ music: null, status: "stopped", positionMs: 0 }) });
        expect((await emitWithAck(playerSocket, "session:join", target)).ok).toBe(true);
        expect(await emitWithAck(strangerSocket, "session:join", target)).toEqual({ ok: false, error: "User is not a member of this session" });
        expect(await emitWithAck(hostSocket, "session:join", { sessionId: session.body.id + 1000 })).toEqual({ ok: false, error: "Session does not exist" });

        expect(await emitWithAck(hostSocket, "playback:command", { ...target, action: "play" })).toEqual({ ok: false, error: "Nothing to play" });

        const drawnForHost = waitForEvent(hostSocket, "session:state");
        const drawnForPlayer = waitForEvent(playerSocket, "session:state");
        const draw = await host.client.post("/audio/resolve", { ...target, zone: "forest", ambiance: "calm" });
        expect(draw.status).toBe(200);
        const drawn = await drawnForPlayer;
        expect(await drawnForHost).toEqual(drawn);
        expect(drawn.sessionId).toBe(session.body.id);
        expect(drawn.state).toMatchObject({ music: draw.body.music, status: "playing", positionMs: 0, zone: "forest" });
        await expectNoEvent(strangerSocket, "session:state");

        const denied = await emitWithAck(playerSocket, "playback:command", { ...target, action: "pause" });
        expect(denied).toEqual({ ok: false, error: "User is not the owner of the session" });

        const paused = waitForEvent(playerSocket, "session:state");
        expect(await emitWithAck(hostSocket, "playback:command", { ...target, action: "pause" })).toEqual({ ok: true });
        const pausedState = (await paused).state;
        expect(pausedState).toMatchObject({ status: "paused", startedAt: null });
        expect(pausedState.positionMs).toBeGreaterThanOrEqual(0);

        const resumed = waitForEvent(playerSocket, "session:state");
        await emitWithAck(hostSocket, "playback:command", { ...target, action: "play" });
        expect((await resumed).state).toMatchObject({ status: "playing", positionMs: pausedState.positionMs });

        playerSocket.close();
        const reconnected = await connect(player.client.token);
        const resume = await emitWithAck(reconnected, "session:join", target);
        expect(resume.state).toMatchObject({ status: "playing", music: draw.body.music, positionMs: pausedState.positionMs });
        expect(resume.state).toEqual((await player.client.request("GET", `/session/${session.body.id}/state`)).body);

        const stopped = waitForEvent(reconnected, "session:state");
        await emitWithAck(hostSocket, "playback:command", { ...target, action: "stop" });
        expect((await stopped).state).toMatchObject({ status: "stopped", positionMs: 0, startedAt: null });
        expect((await host.client.request("GET", `/session/${session.body.id}/state`)).body).toMatchObject({ status: "stopped", positionMs: 0 });
    });

    it("refuses a socket without a valid access token", async () => {
        await expect(connectSocket(server.baseUrl)).rejects.toThrow("Unauthorized");
        await expect(connectSocket(server.baseUrl, "forged.token.value")).rejects.toThrow("Unauthorized");
    });
});

describe("sound deletion", () => {
    it("lets the uploader delete a private sound, frees the quota and keeps the other sounds", async () => {
        const owner = await signUpAndSignIn(api, "del-owner");
        const other = await signUpAndSignIn(api, "del-other");
        const forestCalm = { zone: "forest", ambiance: "calm" };

        const mine = await owner.client.post("/audio/upload", audioForm({ name: "Mine", type: "music", ...forestCalm, isUserImported: true }));
        const theirs = await other.client.post("/audio/upload", audioForm({ name: "Theirs", type: "music", ...forestCalm, isUserImported: true }));
        const shared = await owner.client.post("/audio/upload", audioForm({ name: "Shared", type: "music", ...forestCalm, isUserImported: false }));
        expect([mine.status, theirs.status, shared.status]).toEqual([200, 200, 200]);
        const storage = MinioStorageService.getInstance();

        const byStranger = await other.client.delete(`/audio?key=${encodeURIComponent(mine.body.key)}`);
        expect(byStranger.status).toBe(400);
        expect(byStranger.body.error).toBe("You can only delete your own sounds");
        const publicByUploader = await owner.client.delete(`/audio?key=${encodeURIComponent(shared.body.key)}`);
        expect(publicByUploader.status).toBe(400);
        expect((await owner.client.delete(`/audio?key=${encodeURIComponent("sounds/9999/ghost.mp3")}`)).body.error).toBe("Sound does not exist");
        expect((await owner.client.request("DELETE", "/audio")).status).toBe(400);
        expect((await api.request("DELETE", `/audio?key=${encodeURIComponent(mine.body.key)}`)).status).toBe(401);
        expect(await storage.listByPrefix("sounds/")).toContain(mine.body.key);

        const deleted = await owner.client.delete(`/audio?key=${encodeURIComponent(mine.body.key)}`);
        expect(deleted.status).toBe(200);
        expect(deleted.body).toEqual(mine.body);

        const remaining = await storage.listByPrefix("sounds/");
        expect(remaining).not.toContain(mine.body.key);
        expect(remaining).toEqual(expect.arrayContaining([theirs.body.key, shared.body.key]));
        expect(await AppDataSource.getRepository(AudioTrack).countBy({ storageKey: mine.body.key })).toBe(0);
        const listed = await owner.client.post("/audio/list", { isUserImported: true });
        expect(listed.body.data.map((s: { key: string }) => s.key)).not.toContain(mine.body.key);
        expect((await owner.client.delete(`/audio?key=${encodeURIComponent(mine.body.key)}`)).status).toBe(400);

        const again = await owner.client.post("/audio/upload", audioForm({ name: "Mine again", type: "music", ...forestCalm, isUserImported: true }, mine.body.key.split("/")[2]));
        expect(again.status).toBe(200);
    });

    it("clears the current sound of a session when its file is deleted", async () => {
        const host = await signUpAndSignIn(api, "del-host");
        const volcanicCalm = { zone: "volcanic", ambiance: "calm", isUserImported: true };
        const music = await host.client.post("/audio/upload", audioForm({ name: "Playing", type: "music", ...volcanicCalm }));
        const session = await host.client.post("/session", { sessionName: "Deletion" });
        const draw = await host.client.post("/audio/resolve", { sessionId: session.body.id, zone: "volcanic", ambiance: "calm" });
        expect(draw.status).toBe(200);
        expect(draw.body.music.key).toBe(music.body.key);

        expect((await host.client.delete(`/audio?key=${encodeURIComponent(music.body.key)}`)).status).toBe(200);

        const state = await host.client.request("GET", `/session/${session.body.id}/state`);
        expect(state.status).toBe(200);
        expect(state.body).toMatchObject({ music: null, zone: "volcanic", status: "playing" });
    });
});
