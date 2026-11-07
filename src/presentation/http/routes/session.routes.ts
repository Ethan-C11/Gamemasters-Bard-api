import type {FastifyPluginAsyncTypebox} from "@fastify/type-provider-typebox";
import {authenticate} from "../hooks/authenticate.js";
import {
    CreateSessionBody,
    JoinSessionBody,
    QuitSessionBody,
    SessionParams,
    SessionResponse,
    SessionStateResponse
} from "../../../application/dtos/session.schema.js";
import {CreateSessionUseCase} from "../../../application/useCases/session/CreateSessionUseCase.js";
import {toSessionDto, toSessionStateDto} from "../../../application/mappers/session.mappers.js";
import {ErrorResponse} from "../../../application/dtos/shared.schema.js";
import {DeleteSessionUseCase} from "../../../application/useCases/session/DeleteSessionUseCase.js";
import {JoinSessionUseCase} from "../../../application/useCases/session/JoinSessionUseCase.js";
import {QuitSessionUseCase} from "../../../application/useCases/session/QuitSessionUseCase.js";
import {GetSessionStateUseCase} from "../../../application/useCases/session/GetSessionStateUseCase.js";
import {authorize} from "../hooks/authorize.js";
import {Role} from "../../../shared/enums/Role.js";


export const sessionRoutes: FastifyPluginAsyncTypebox = async (app) => {

    app.post("/", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN)],
        schema: {
            tags: ["Sessions"],
            summary: "Créer une session",
            security: [{ bearerAuth: [] }],
            body: CreateSessionBody,
            response: { 201: SessionResponse, 400: ErrorResponse },
        },
    }, async (request, reply) => {
        try {
            const session = await CreateSessionUseCase.getInstance()
                .execute(request.user.id, request.body.sessionName);
            return reply.status(201).send(toSessionDto(session));
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.delete("/:id", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN)],
        schema: {
            tags: ["Sessions"],
            summary: "Supprimer une session (owner uniquement)",
            security: [{ bearerAuth: [] }],
            params: SessionParams,
            response: { 200: SessionResponse, 400: ErrorResponse },
        },
    }, async (request, reply) => {
        try {
            const session = await DeleteSessionUseCase.getInstance()
                .execute(request.params.id, request.user.id);
            return reply.status(200).send(toSessionDto(session));
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/join", {
        preHandler: [authenticate],
        schema: {
            tags: ["Sessions"],
            summary: "Rejoindre une session via un code d'invitation",
            security: [{ bearerAuth: [] }],
            body: JoinSessionBody,
            response: { 200: SessionResponse, 400: ErrorResponse },
        },
    }, async (request, reply) => {
        try {
            const session = await JoinSessionUseCase.getInstance()
                .execute(request.body.inviteCode, request.user.id);
            return reply.status(200).send(toSessionDto(session));
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/quit/:id", {
        preHandler: [authenticate],
        schema: {
            tags: ["Sessions"],
            summary: "Quitter une session (ou la supprimer si owner + forceDelete)",
            security: [{ bearerAuth: [] }],
            params: SessionParams,
            body: QuitSessionBody,
            response: { 200: SessionResponse, 400: ErrorResponse },
        },
    }, async (request, reply) => {
        try {
            const session = await QuitSessionUseCase.getInstance()
                .execute(request.params.id, request.user.id, request.body.forceDelete ?? false);
            return reply.status(200).send(toSessionDto(session));
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.get("/:id/state", {
        preHandler: [authenticate],
        schema: {
            tags: ["Sessions"],
            summary: "Récupérer l'état courant de la session (owner et membres)",
            security: [{ bearerAuth: [] }],
            params: SessionParams,
            response: { 200: SessionStateResponse, 400: ErrorResponse },
        },
    }, async (request, reply) => {
        try {
            const session = await GetSessionStateUseCase.getInstance()
                .execute(request.params.id, request.user.id);
            return reply.status(200).send(toSessionStateDto(session));
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });
};