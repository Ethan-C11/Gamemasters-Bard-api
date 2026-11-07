import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import type { Socket } from "socket.io-client";
import { buildApp, type App } from "../../src/app.js";
import { bearer, tokenFor } from "../helpers/app.js";
import { makeSession, makeTrack } from "../helpers/factories.js";
import { connectSocket, emitWithAck, expectNoEvent, waitForEvent } from "../helpers/socket.js";
import { GetSessionStateUseCase } from "../../src/application/useCases/session/GetSessionStateUseCase.js";
import { TriggerPlaybackUseCase } from "../../src/application/useCases/playback/TriggerPlaybackUseCase.js";
import DrawSessionSoundsUseCase from "../../src/application/useCases/audio/DrawSessionSoundsUseCase.js";
import { Role } from "../../src/shared/enums/Role.js";

let app: App;
let baseUrl: string;
let ownerToken: string;
const sockets: Socket[] = [];

async function connect(token: string | undefined = ownerToken): Promise<Socket> {
    const socket = await connectSocket(baseUrl, token);
    sockets.push(socket);
    return socket;
}

beforeAll(async () => {
    app = await buildApp({ logger: false, rateLimit: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    ownerToken = tokenFor(app, Role.USER, 1);
});

afterEach(() => {
    while (sockets.length) sockets.pop()?.close();
});

afterAll(async () => {
    await app.close();
});

describe("socket authentication", () => {
    it("accepts a valid access token", async () => {
        const socket = await connect();

        expect(socket.connected).toBe(true);
    });

    it("refuses a connection without token", async () => {
        await expect(connectSocket(baseUrl)).rejects.toThrow("Unauthorized");
    });

    it("refuses a forged token", async () => {
        await expect(connectSocket(baseUrl, "forged.token.value")).rejects.toThrow("Unauthorized");
    });
});

describe("session:join", () => {
    it("answers with the current state of the session", async () => {
        const execute = vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession({ currentMusic: makeTrack() }));
        const socket = await connect();

        const ack = await emitWithAck(socket, "session:join", { sessionId: 10 });

        expect(ack.ok).toBe(true);
        expect(ack.state.music.key).toBe("sounds/0/forest.mp3");
        expect(ack.state.status).toBe("stopped");
        expect(execute).toHaveBeenCalledWith(10, 1);
    });

    it("answers the error when the user may not join", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not a member of this session"));
        const socket = await connect();

        const ack = await emitWithAck(socket, "session:join", { sessionId: 10 });

        expect(ack).toEqual({ ok: false, error: "User is not a member of this session" });
    });

    it("rejects an invalid payload", async () => {
        const socket = await connect();

        expect(await emitWithAck(socket, "session:join", { sessionId: "ten" })).toEqual({ ok: false, error: "Invalid payload" });
    });
});

describe("session rooms", () => {
    it("sends the state events only to the sockets that joined the session", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValue(makeSession());
        const member = await connect();
        const outsider = await connect(tokenFor(app, Role.USER, 2));
        await emitWithAck(member, "session:join", { sessionId: 10 });

        const received = waitForEvent(member, "session:state");
        app.realtime.emitToSession(10, "session:state", { sessionId: 10, state: { status: "playing" } });

        expect(await received).toEqual({ sessionId: 10, state: { status: "playing" } });
        await expectNoEvent(outsider, "session:state");
    });

    it("stops sending events after the session was left", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValue(makeSession());
        const socket = await connect();
        await emitWithAck(socket, "session:join", { sessionId: 10 });

        expect(await emitWithAck(socket, "session:leave", { sessionId: 10 })).toEqual({ ok: true });
        app.realtime.emitToSession(10, "session:state", {});

        await expectNoEvent(socket, "session:state");
    });
});

describe("playback:command", () => {
    it("broadcasts the new state to every socket of the session", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValue(makeSession());
        const execute = vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession({ playbackStatus: "paused" as never, playbackPositionMs: 1500 }));
        const owner = await connect();
        const player = await connect(tokenFor(app, Role.USER, 2));
        await emitWithAck(owner, "session:join", { sessionId: 10 });
        await emitWithAck(player, "session:join", { sessionId: 10 });

        const ownerEvent = waitForEvent(owner, "session:state");
        const playerEvent = waitForEvent(player, "session:state");
        const ack = await emitWithAck(owner, "playback:command", { sessionId: 10, action: "pause" });

        expect(ack).toEqual({ ok: true });
        expect(execute).toHaveBeenCalledWith(10, 1, "pause");
        expect((await playerEvent).state).toMatchObject({ status: "paused", positionMs: 1500 });
        expect(await ownerEvent).toEqual(await playerEvent);
    });

    it("answers the error and broadcasts nothing when the command is refused", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValue(makeSession());
        vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not the owner of the session"));
        const player = await connect(tokenFor(app, Role.USER, 2));
        await emitWithAck(player, "session:join", { sessionId: 10 });

        const ack = await emitWithAck(player, "playback:command", { sessionId: 10, action: "play" });

        expect(ack).toEqual({ ok: false, error: "User is not the owner of the session" });
        await expectNoEvent(player, "session:state");
    });

    it("rejects an unknown action", async () => {
        const execute = vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute");
        const socket = await connect();

        expect(await emitWithAck(socket, "playback:command", { sessionId: 10, action: "rewind" })).toEqual({ ok: false, error: "Invalid payload" });
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("POST /audio/resolve", () => {
    it("broadcasts the new state of the session once the sounds are drawn", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValue(makeSession({ currentMusic: makeTrack() }));
        vi.spyOn(DrawSessionSoundsUseCase.getInstance(), "execute").mockResolvedValueOnce({ music: null, environment: null });
        const socket = await connect();
        await emitWithAck(socket, "session:join", { sessionId: 10 });

        const received = waitForEvent(socket, "session:state");
        const res = await app.inject({ method: "POST", url: "/audio/resolve", headers: bearer(ownerToken), payload: { sessionId: 10, zone: "forest" } });

        expect(res.statusCode).toBe(200);
        expect((await received).state.music.key).toBe("sounds/0/forest.mp3");
    });

    it("still answers the draw when the state cannot be broadcast", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("DB down"));
        vi.spyOn(DrawSessionSoundsUseCase.getInstance(), "execute").mockResolvedValueOnce({ music: null, environment: null });

        const res = await app.inject({ method: "POST", url: "/audio/resolve", headers: bearer(ownerToken), payload: { sessionId: 10, zone: "forest" } });

        expect(res.statusCode).toBe(200);
    });
});
