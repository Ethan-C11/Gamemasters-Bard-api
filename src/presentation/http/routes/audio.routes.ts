import type { FastifyInstance } from "fastify";
import {MultipartFile} from "@fastify/multipart";
import {AuthResponse} from "../../../application/dtos/auth.schema.js";
import {ErrorResponse} from "../../../application/dtos/shared.schema.js";
import {SoundType} from "../../../shared/enums/SoundType.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import ImportAudioUseCase from "../../../application/useCases/audio/ImportAudioUseCase.js";
import {
    ImportAudioTrackBody,
    AudioTrackResponse,
    ResolveAudioTrackBody, ListAudioTracksBody, PaginatedAudioTrackResponse
} from "../../../application/dtos/soundTrack.schema.js";
import {authenticate} from "../hooks/authenticate.js";
import {authorize} from "../hooks/authorize.js";
import {Role} from "../../../shared/enums/Role.js";
import ResolveAudioUseCase from "../../../application/useCases/audio/ResolveAudioUseCase.js";
import FetchSoundsUseCase from "../../../application/useCases/audio/FetchSoundsUseCase.js";

export async function audioRoutes(app: FastifyInstance) {

    app.post("/upload", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Upload a sound for every user",
            body: ImportAudioTrackBody,
            response: {
                200: AudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const body = request.body as any;

        const name = body.name?.value;
        const type = body.type?.value as SoundType;
        const zone = (body.zone?.value || undefined) as Zone | undefined;
        const ambiance = (body.ambiance?.value || undefined) as Ambiance | undefined;
        const isUserImported = body.isUserImported?.value === "true";
        const file = body.file;

        try {
            const soundTrack = await ImportAudioUseCase.getInstance().execute(request.user.id, file, name, type, zone, ambiance, isUserImported);

            return reply.status(200).send(soundTrack);
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/resolve", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Randomly select a sound for a specific session",
            body: ResolveAudioTrackBody,
            response: {
                200: AudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const body = request.body as any;

        const sessionId = body.type?.value as number
        const type = body.type?.value as SoundType;
        const zone = (body.zone?.value || undefined) as Zone | undefined;
        const ambiance = (body.ambiance?.value || undefined) as Ambiance | undefined;


        try {
            const soundTrack = await ResolveAudioUseCase.getInstance().execute(request.user.id, sessionId, type, zone, ambiance);

            return reply.status(200).send(soundTrack);
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/list", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Get a paginated list of audio tracks based on filters",
            body: ListAudioTracksBody,
            response: {
                200: PaginatedAudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const body = request.body as any;

        const type = (body.type?.value ?? body.type) as SoundType;
        const zone = (body.zone?.value ?? body.zone) as Zone | undefined;
        const ambiance = (body.ambiance?.value ?? body.ambiance) as Ambiance | undefined;
        const isUserImported = body.isUserImported as boolean | undefined;

        const offset = (body.offset ?? 0) as number;
        const limit = (body.limit ?? 20) as number;

        try {
            const result = await FetchSoundsUseCase.getInstance().execute(
                request.user.id,
                type,
                zone,
                ambiance,
                isUserImported,
                offset,
                limit
            );

            return reply.status(200).send(result);
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });


}