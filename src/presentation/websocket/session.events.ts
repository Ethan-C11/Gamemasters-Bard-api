import {SocketIOAdapter} from "../../infrastructure/realtime/SocketIOAdapter.js";
import {Session} from "../../infrastructure/db/entities/session.entity.js";
import {toSessionStateDto} from "../../application/mappers/session.mappers.js";
import {SocketEvent} from "../../shared/enums/SocketEvent.js";

export function emitSessionState(adapter: SocketIOAdapter, session: Session): void {
    adapter.emitToSession(session.id, SocketEvent.SESSION_STATE, {
        sessionId: session.id,
        state: toSessionStateDto(session),
    });
}
