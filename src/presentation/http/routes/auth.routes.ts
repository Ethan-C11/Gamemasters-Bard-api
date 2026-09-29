    import type { FastifyInstance } from "fastify";
import { JwtPayload } from "../../../shared/types/jwt-payload.js";
import {SignUpUseCase} from "../../../application/useCases/auth/SignUpUseCase.js";
import {SignInUseCase} from "../../../application/useCases/auth/SignInUseCase.js";
    import {
    ActivateBody,
    ActivateResponse,
    AuthResponse, RefreshBody,
    SignInBody,
    SignUpBody
} from "../../../application/dtos/auth.schema.js";
    import {ErrorResponse} from "../../../application/dtos/shared.schema.js";
    import {AccountActivationUseCase} from "../../../application/useCases/user/AccountActivationUseCase.js";
    import {User} from "../../../infrastructure/db/entities/user.entity.js";
    import {RefreshAccessTokenUseCase} from "../../../application/useCases/auth/RefreshAccessTokenUseCase.js";
    import {IssueRefreshTokenUseCase} from "../../../application/useCases/auth/IssueRefreshTokenUseCase.js";

export async function authRoutes(app: FastifyInstance) {

    app.post("/signup", {
        schema: {
            tags: ["Auth"],
            summary: "Create an user account",
            body: SignUpBody,
            response: {
                201: AuthResponse,
                400: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { email, username, password } = request.body as {
            email: string; username: string; password: string;
        };

        try {
            const user: User = await SignUpUseCase.getInstance().execute(email, username, password);

            const payload: JwtPayload = { id: user.id, email: user.email, role: user.role };
            const token = app.jwt.sign(payload);

            return reply.status(201).send({ token, user: { id: user.id, email: user.email, username: user.username } });
        } catch (err) {
            return reply.status(400).send({ error: (err as Error).message });
        }
    });

    app.post("/signin", {
        schema: {
            tags: ["Auth"],
            summary: "Connect to an user account",
            body: SignInBody,
            response: {
                200: AuthResponse,
                401: ErrorResponse,
            },
        },
    }, async (request, reply) => {
        const { email, password } = request.body as { email: string; password: string };

        try {
            const user: User = await SignInUseCase.getInstance().execute(email, password);

            const payload: JwtPayload = { id: user.id, email: user.email, role: user.role };
            const token = app.jwt.sign(payload);
            const refreshToken = await IssueRefreshTokenUseCase.getInstance().execute(user.id);

            return reply.status(200).send({
                token,
                refreshToken,
                user: { id: user.id, email: user.email, username: user.username }
            });
        } catch (err) {
            return reply.status(401).send({ error: (err as Error).message });
        }
    });

    app.post('/refresh', {
        schema: {
            tags: ["Auth"],
            summary: "Refresh an user access token",
            body: RefreshBody,
            response: {
                200: AuthResponse,
                401: ErrorResponse,
            },
        }
    }, async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken: string };

        try {
            const { user, newRawRefreshToken } = await RefreshAccessTokenUseCase.getInstance().execute(refreshToken);

            const payload: JwtPayload = { id: user.id, email: user.email, role: user.role };
            const token = app.jwt.sign(payload);

            return reply.status(200).send({
                token,
                refreshToken: newRawRefreshToken,
                user: { id: user.id, email: user.email, username: user.username }
            });
        } catch (err) {
            return reply.status(401).send({ error: (err as Error).message });
        }
    });

    app.post('/activate', {
        schema: {
            tags: ["Auth"],
            summary: "Activate an user",
            body: ActivateBody,
            response: {
                200: ActivateResponse,
                401: ErrorResponse,
            },
        }
    }, async (request, reply) => {
        const { token, password } = request.body as { token: string; password: string };
        try {
            const user: User = await AccountActivationUseCase.getInstance().execute(token, password);
            return reply.status(200).send({ token, user: { id: user.id, email: user.email, username: user.username } });
        } catch (err: any) {
            return reply.status(401).send({ error: (err as Error).message });
        }
    });
}