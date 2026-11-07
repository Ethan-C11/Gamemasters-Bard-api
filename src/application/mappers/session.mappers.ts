import { Session } from "../../infrastructure/db/entities/session.entity.js";
import { toAudioTrackDto } from "./audio.mappers.js";

export function toSessionDto(session: Session) {
    return {
        id: session.id,
        sessionName: session.sessionName,
        inviteCode: session.inviteCode,
        createdAt: session.createdAt.toISOString(),
        owner: { id: session.owner.id, username: session.owner.username },
        sessionMembers: (session.sessionMembers ?? []).map(m => ({ id: m.id, username: m.username })),
    };
}

export function toSessionStateDto(session: Session) {
    return {
        music: toAudioTrackDto(session.currentMusic),
        environment: toAudioTrackDto(session.currentEnvironment),
        zone: session.currentZone,
        ambiance: session.currentAmbiance,
        startedAt: session.playbackStartedAt ? session.playbackStartedAt.toISOString() : null,
    };
}
