import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { MultipartFile } from "@fastify/multipart";
import {ErrorResponse} from "../../../application/dtos/shared.schema.js";
import {SoundType} from "../../../shared/enums/SoundType.js";
import {Zone} from "../../../shared/enums/Zone.js";
import {Ambiance} from "../../../shared/enums/Ambiance.js";
import ImportAudioUseCase from "../../../application/useCases/audio/ImportAudioUseCase.js";
import {
    ImportAudioTrackBody,
    AudioTrackResponse,
    DrawSessionSoundsBody, DrawSessionSoundsResponse, ListAudioTracksBody, PaginatedAudioTrackResponse, DeleteAudioTrackQuery
} from "../../../application/dtos/soundTrack.schema.js";
import {authenticate} from "../hooks/authenticate.js";
import {authorize} from "../hooks/authorize.js";
import {Role} from "../../../shared/enums/Role.js";
import DrawSessionSoundsUseCase from "../../../application/useCases/audio/DrawSessionSoundsUseCase.js";
import ListAudioTracksUseCase from "../../../application/useCases/audio/ListAudioTracksUseCase.js";
import DeleteAudioTrackUseCase from "../../../application/useCases/audio/DeleteAudioTrackUseCase.js";
import {GetSessionStateUseCase} from "../../../application/useCases/session/GetSessionStateUseCase.js";
import {emitSessionState} from "../../websocket/session.events.js";

interface ImportAudioMultipartBody {
    name?: { value?: string };
    type?: { value?: string };
    zone?: { value?: string };
    ambiance?: { value?: string };
    isUserImported?: { value?: string };
    file?: MultipartFile;
}

export const audioRoutes: FastifyPluginAsyncTypebox = async (app) => {

    app.post("/upload", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Upload a sound for every user (multipart: file, name, zone, ambiance, type, [isUserImported])",
            body: ImportAudioTrackBody,
            response: {
                200: AudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const body = request.body as ImportAudioMultipartBody;

        const name = body.name?.value ?? "";
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
            summary: "Randomly select a music and an environment sound for a session, by zone and/or ambiance (at least one)",
            body: DrawSessionSoundsBody,
            response: {
                200: DrawSessionSoundsResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { sessionId, zone, ambiance } = request.body;

        try {
            const soundTrack = await DrawSessionSoundsUseCase.getInstance().execute(request.user.id, sessionId, zone, ambiance);

            GetSessionStateUseCase.getInstance().execute(sessionId, request.user.id)
                .then((session) => emitSessionState(app.realtime, session))
                .catch((err) => app.log.error(err));

            return reply.status(200).send(soundTrack);
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/list", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Get a paginated list of audio tracks, optionally filtered by zone and/or ambiance",
            body: ListAudioTracksBody,
            response: {
                200: PaginatedAudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { type, zone, ambiance, isUserImported, offset = 0, limit = 20 } = request.body;

        try {
            const result = await ListAudioTracksUseCase.getInstance().execute(
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

    app.delete("/", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["Soundtrack"],
            summary: "Delete a sound the user uploaded (identified by its key)",
            querystring: DeleteAudioTrackQuery,
            response: {
                200: AudioTrackResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { key } = request.query;

        try {
            const deleted = await DeleteAudioTrackUseCase.getInstance().execute(request.user.id, key);

            return reply.status(200).send(deleted);
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });
}