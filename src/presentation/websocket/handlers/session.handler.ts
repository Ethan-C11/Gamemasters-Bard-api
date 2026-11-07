import type {Socket} from "socket.io";
import {SocketIOAdapter} from "../../../infrastructure/realtime/SocketIOAdapter.js";
import {GetSessionStateUseCase} from "../../../application/useCases/session/GetSessionStateUseCase.js";
import {toSessionStateDto} from "../../../application/mappers/session.mappers.js";
import {isSessionTarget} from "../../../domain/playback/PlaybackCommand.js";
import {SocketEvent} from "../../../shared/enums/SocketEvent.js";
import {JwtPayload} from "../../../shared/types/jwt-payload.js";

export function registerSessionHandlers(socket: Socket): void {
    const user: JwtPayload = socket.data.user;

    socket.on(SocketEvent.SESSION_JOIN, async (payload: unknown, ack?: (response: unknown) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        if (!isSessionTarget(payload))
            return reply({ ok: false, error: "Invalid payload" });

        try {
            const session = await GetSessionStateUseCase.getInstance().execute(payload.sessionId, user.id);
            await socket.join(SocketIOAdapter.roomOf(payload.sessionId));
            reply({ ok: true, state: toSessionStateDto(session) });
        } catch (err) {
            reply({ ok: false, error: (err as Error).message });
        }
    });

    socket.on(SocketEvent.SESSION_LEAVE, async (payload: unknown, ack?: (response: unknown) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        if (!isSessionTarget(payload))
            return reply({ ok: false, error: "Invalid payload" });

        await socket.leave(SocketIOAdapter.roomOf(payload.sessionId));
        reply({ ok: true });
    });
}
