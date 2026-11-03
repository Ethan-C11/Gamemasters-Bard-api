import { Type, Static } from "@fastify/type-provider-typebox";
import {SoundType} from "../../shared/enums/SoundType.js";
import {Zone} from "../../shared/enums/Zone.js";
import {Ambiance} from "../../shared/enums/Ambiance.js";


export const ImportAudioTrackBody = Type.Any();
export type ImportAudioTrackBody = Static<typeof ImportAudioTrackBody>;

export const ResolveAudioTrackBody = Type.Object({
        sessionId: Type.Number(),
        zone: Type.Optional(Type.Enum(Zone)),
        ambiance: Type.Optional(Type.Enum(Ambiance)),
});
export type ResolveAudioTrackBody = Static<typeof ResolveAudioTrackBody>;


export const AudioTrackResponse = Type.Object({
        key: Type.String(),
        name: Type.String(),
        type: Type.String(),
        zone: Type.String(),
        ambiance: Type.String(),
        isUserImported: Type.Boolean(),
});

export type AudioTrackResponse = Static<typeof AudioTrackResponse>;

export const ResolveAudioResponse = Type.Object({
    music: Type.Union([AudioTrackResponse, Type.Null()]),
    environment: Type.Union([AudioTrackResponse, Type.Null()]),
});

export type ResolveAudioResponse = Static<typeof ResolveAudioResponse>;

export const PaginatedAudioTrackResponse = Type.Object({
    data: Type.Array(AudioTrackResponse),
    total: Type.Number()
});

export type PaginatedAudioTrackResponse = Static<typeof PaginatedAudioTrackResponse>;

export const ListAudioTracksBody = Type.Object({
    type: Type.Optional(Type.Enum(SoundType)),
    zone: Type.Optional(Type.Enum(Zone)),
    ambiance: Type.Optional(Type.Enum(Ambiance)),
    isUserImported: Type.Optional(Type.Boolean()),
    offset: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
});

export type ListAudioTracksBody = Static<typeof ListAudioTracksBody>;
