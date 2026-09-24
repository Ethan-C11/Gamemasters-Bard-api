import {ErrorResponse} from "../../../application/dtos/shared.schema.js";
import {EditUserBody, UserDeleteParams, UserResponse} from "../../../application/dtos/user.schema.js";
import {EditUserUseCase} from "../../../application/useCases/user/EditUserUseCase.js";
import {authenticate} from "../hooks/authenticate.js";
import {authorize} from "../hooks/authorize.js";
import {Role} from "../../../shared/enums/Role.js";
import {DeleteUserUseCase} from "../../../application/useCases/user/DeleteUserUseCase.js";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

export const userRoutes: FastifyPluginAsyncTypebox = async (app) => {

    app.put("/", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["User"],
            summary: "Edit the user account",
            security: [{ bearerAuth: [] }],
            body: EditUserBody,
            response: {
                200: UserResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { email, username, password } = request.body;

        try {
            const user = await EditUserUseCase.getInstance().execute(request.user.id,username, email, password);


            return reply.status(200).send({ user: { id: user.id, email: user.email, username: user.username } });
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.delete("/", {
        preHandler: [authenticate, authorize(Role.USER, Role.ADMIN, Role.SOUND_CREATOR)],
        schema: {
            tags: ["User"],
            summary: "Delete the user account",
            security: [{ bearerAuth: [] }],
            response: {
                200: UserResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        try {
            const user = await DeleteUserUseCase.getInstance().execute(request.user.id);


            return reply.status(200).send({ user: { id: user.id, email: user.email, username: user.username } });
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.delete("/admin/:id", {
        preHandler: [authenticate, authorize(Role.ADMIN)],
        schema: {
            tags: ["User"],
            summary: "(ADMIN) Delete an user account",
            security: [{ bearerAuth: [] }],
            params: UserDeleteParams,
            response: {
                200: UserResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        try {
            const user = await DeleteUserUseCase.getInstance().execute(request.params.id);


            return reply.status(200).send({ user: { id: user.id, email: user.email, username: user.username } });
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });
};