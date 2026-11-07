import type {Socket} from "socket.io";
import {SocketIOAdapter} from "../../../infrastructure/realtime/SocketIOAdapter.js";
import {TriggerPlaybackUseCase} from "../../../application/useCases/playback/TriggerPlaybackUseCase.js";
import {isPlaybackCommand} from "../../../domain/playback/PlaybackCommand.js";
import {SocketEvent} from "../../../shared/enums/SocketEvent.js";
import {JwtPayload} from "../../../shared/types/jwt-payload.js";
import {emitSessionState} from "../session.events.js";

export function registerPlaybackHandlers(adapter: SocketIOAdapter, socket: Socket): void {
    const user: JwtPayload = socket.data.user;

    socket.on(SocketEvent.PLAYBACK_COMMAND, async (payload: unknown, ack?: (response: unknown) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        if (!isPlaybackCommand(payload))
            return reply({ ok: false, error: "Invalid payload" });

        try {
            const session = await TriggerPlaybackUseCase.getInstance().execute(payload.sessionId, user.id, payload.action);
            emitSessionState(adapter, session);
            reply({ ok: true });
        } catch (err) {
            reply({ ok: false, error: (err as Error).message });
        }
    });
}
