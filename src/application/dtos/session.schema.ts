import { Type, Static } from "@fastify/type-provider-typebox";
import { AudioTrackResponse } from "./soundTrack.schema.js";

export const CreateSessionBody = Type.Object({
    sessionName: Type.String({ minLength: 1 }),
});
export type CreateSessionBody = Static<typeof CreateSessionBody>;

export const JoinSessionBody = Type.Object({
    inviteCode: Type.String({ minLength: 6, maxLength: 6 }),
});
export type JoinSessionBody = Static<typeof JoinSessionBody>;

export const QuitSessionBody = Type.Object({
    forceDelete: Type.Optional(Type.Boolean()),
});
export type QuitSessionBody = Static<typeof QuitSessionBody>;

export const SessionParams = Type.Object({
    id: Type.Number(),
});
export type SessionParams = Static<typeof SessionParams>;

const UserSummary = Type.Object({
    id: Type.Number(),
    username: Type.String(),
});

export const SessionResponse = Type.Object({
    id: Type.Number(),
    sessionName: Type.String(),
    inviteCode: Type.String(),
    createdAt: Type.String(),
    owner: UserSummary,
    sessionMembers: Type.Array(UserSummary),
});

export const SessionStateResponse = Type.Object({
    music: Type.Union([AudioTrackResponse, Type.Null()]),
    environment: Type.Union([AudioTrackResponse, Type.Null()]),
    zone: Type.Union([Type.String(), Type.Null()]),
    ambiance: Type.Union([Type.String(), Type.Null()]),
    startedAt: Type.Union([Type.String(), Type.Null()]),
});
export type SessionStateResponse = Static<typeof SessionStateResponse>;
