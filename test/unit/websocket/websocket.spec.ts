import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { makeSession } from "../../helpers/factories.js";
import { registerSessionHandlers } from "../../../src/presentation/websocket/handlers/session.handler.js";
import { registerPlaybackHandlers } from "../../../src/presentation/websocket/handlers/playback.handler.js";
import { emitSessionState } from "../../../src/presentation/websocket/session.events.js";
import { SocketIOAdapter } from "../../../src/infrastructure/realtime/SocketIOAdapter.js";
import { GetSessionStateUseCase } from "../../../src/application/useCases/session/GetSessionStateUseCase.js";
import { TriggerPlaybackUseCase } from "../../../src/application/useCases/playback/TriggerPlaybackUseCase.js";
import { isPlaybackCommand, isSessionTarget } from "../../../src/domain/playback/PlaybackCommand.js";
import { PlaybackAction } from "../../../src/shared/enums/PlaybackAction.js";
import { SocketEvent } from "../../../src/shared/enums/SocketEvent.js";

type Handler = (payload: unknown, ack?: (response: unknown) => void) => Promise<void>;

function fakeSocket(userId = 1) {
    const handlers = new Map<string, Handler>();
    const socket = {
        data: { user: { id: userId, email: "gm@gm-test.test", role: "user" } },
        on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
        join: vi.fn(async () => {}),
        leave: vi.fn(async () => {}),
    };
    const call = (event: string, payload: unknown, ack?: (response: unknown) => void) => (handlers.get(event) as Handler)(payload, ack);
    return { socket: socket as never, raw: socket, call };
}

describe("payload guards", () => {
    it.each([
        [{ sessionId: 3 }, true],
        [{ sessionId: "3" }, false],
        [{ sessionId: 1.5 }, false],
        [{}, false],
        [null, false],
        ["3", false],
    ])("isSessionTarget(%j) is %s", (payload, expected) => {
        expect(isSessionTarget(payload)).toBe(expected);
    });

    it.each([
        [{ sessionId: 3, action: PlaybackAction.PLAY }, true],
        [{ sessionId: 3, action: "pause" }, true],
        [{ sessionId: 3, action: "rewind" }, false],
        [{ sessionId: 3 }, false],
        [{ action: "play" }, false],
    ])("isPlaybackCommand(%j) is %s", (payload, expected) => {
        expect(isPlaybackCommand(payload)).toBe(expected);
    });
});

describe("registerSessionHandlers", () => {
    it("joins the room of the session and answers with its state", async () => {
        const { socket, raw, call } = fakeSocket(2);
        registerSessionHandlers(socket);
        const execute = vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());
        const ack = vi.fn();

        await call(SocketEvent.SESSION_JOIN, { sessionId: 10 }, ack);

        expect(execute).toHaveBeenCalledWith(10, 2);
        expect(raw.join).toHaveBeenCalledWith("session:10");
        expect(ack).toHaveBeenCalledWith({ ok: true, state: expect.objectContaining({ status: "stopped", positionMs: 0, music: null }) });
    });

    it("answers the error and does not join when the user may not read the session", async () => {
        const { socket, raw, call } = fakeSocket(3);
        registerSessionHandlers(socket);
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not a member of this session"));
        const ack = vi.fn();

        await call(SocketEvent.SESSION_JOIN, { sessionId: 10 }, ack);

        expect(raw.join).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: "User is not a member of this session" });
    });

    it("rejects an invalid payload", async () => {
        const { socket, raw, call } = fakeSocket();
        registerSessionHandlers(socket);
        const ack = vi.fn();

        await call(SocketEvent.SESSION_JOIN, { sessionId: "x" }, ack);

        expect(raw.join).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: "Invalid payload" });
    });

    it("works without an acknowledgement callback", async () => {
        const { socket, raw, call } = fakeSocket();
        registerSessionHandlers(socket);
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        await call(SocketEvent.SESSION_JOIN, { sessionId: 10 });
        await call(SocketEvent.SESSION_LEAVE, { sessionId: 10 });
        await call(SocketEvent.SESSION_LEAVE, { sessionId: "x" });

        expect(raw.join).toHaveBeenCalledOnce();
        expect(raw.leave).toHaveBeenCalledOnce();
    });

    it("leaves the room of the session", async () => {
        const { socket, raw, call } = fakeSocket();
        registerSessionHandlers(socket);
        const ack = vi.fn();

        await call(SocketEvent.SESSION_LEAVE, { sessionId: 10 }, ack);

        expect(raw.leave).toHaveBeenCalledWith("session:10");
        expect(ack).toHaveBeenCalledWith({ ok: true });
    });

    it("rejects an invalid leave payload", async () => {
        const { socket, raw, call } = fakeSocket();
        registerSessionHandlers(socket);
        const ack = vi.fn();

        await call(SocketEvent.SESSION_LEAVE, null, ack);

        expect(raw.leave).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: "Invalid payload" });
    });
});

describe("registerPlaybackHandlers", () => {
    const adapter = () => ({ emitToSession: vi.fn() }) as unknown as SocketIOAdapter;

    it("applies the command of the user and broadcasts the new state to the room", async () => {
        const { socket, call } = fakeSocket(1);
        const room = adapter();
        registerPlaybackHandlers(room, socket);
        const execute = vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());
        const ack = vi.fn();

        await call(SocketEvent.PLAYBACK_COMMAND, { sessionId: 10, action: "pause" }, ack);

        expect(execute).toHaveBeenCalledWith(10, 1, PlaybackAction.PAUSE);
        expect(room.emitToSession).toHaveBeenCalledWith(10, SocketEvent.SESSION_STATE, { sessionId: 10, state: expect.objectContaining({ status: "stopped" }) });
        expect(ack).toHaveBeenCalledWith({ ok: true });
    });

    it("answers the error and broadcasts nothing when the command fails", async () => {
        const { socket, call } = fakeSocket(2);
        const room = adapter();
        registerPlaybackHandlers(room, socket);
        vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not the owner of the session"));
        const ack = vi.fn();

        await call(SocketEvent.PLAYBACK_COMMAND, { sessionId: 10, action: "play" }, ack);

        expect(room.emitToSession).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: "User is not the owner of the session" });
    });

    it("rejects an invalid command", async () => {
        const { socket, call } = fakeSocket();
        const room = adapter();
        registerPlaybackHandlers(room, socket);
        const execute = vi.spyOn(TriggerPlaybackUseCase.getInstance(), "execute");
        const ack = vi.fn();

        await call(SocketEvent.PLAYBACK_COMMAND, { sessionId: 10, action: "rewind" }, ack);
        await call(SocketEvent.PLAYBACK_COMMAND, { sessionId: 10, action: "rewind" });

        expect(execute).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: "Invalid payload" });
    });
});

describe("emitSessionState", () => {
    it("sends the state of the session to its room", () => {
        const adapter = { emitToSession: vi.fn() } as unknown as SocketIOAdapter;

        emitSessionState(adapter, makeSession({ id: 7 }));

        expect(adapter.emitToSession).toHaveBeenCalledWith(7, "session:state", { sessionId: 7, state: expect.objectContaining({ zone: null }) });
    });
});

describe("SocketIOAdapter", () => {
    it("names the room of a session", () => {
        expect(SocketIOAdapter.roomOf(5)).toBe("session:5");
    });

    it("accepts a cors origin and closes cleanly", async () => {
        const withOrigin = new SocketIOAdapter(createServer(), "http://localhost:5173");
        const withoutOrigin = new SocketIOAdapter(createServer());
        withOrigin.useMiddleware((_socket, next) => next());
        withOrigin.onConnection(() => {});
        withOrigin.emitToSession(1, "session:state", {});

        await expect(withOrigin.close()).resolves.toBeUndefined();
        await expect(withoutOrigin.close()).resolves.toBeUndefined();
    });
});
