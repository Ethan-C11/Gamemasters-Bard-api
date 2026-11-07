import 'reflect-metadata'
import Fastify, { type FastifyServerOptions } from 'fastify'
import multipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {registerJwt} from "./presentation/http/plugins/jwt.plugin.js";
import {registerDocs} from "./presentation/http/plugins/docs.plugin.js";
import {authRoutes} from "./presentation/http/routes/auth.routes.js";
import {sessionRoutes} from "./presentation/http/routes/session.routes.js";
import {userRoutes} from "./presentation/http/routes/user.routes.js";
import {audioRoutes} from "./presentation/http/routes/audio.routes.js";
import {registerSocket} from "./presentation/websocket/socket.plugin.js";

export interface BuildAppOptions {
    logger?: FastifyServerOptions["logger"];
    rateLimit?: { max: number; timeWindow: string } | false;
}

export async function buildApp(options: BuildAppOptions = {}) {
    const { logger = true, rateLimit = { max: 30, timeWindow: '1 minute' } } = options;

    const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();

    await registerJwt(app);
    await registerDocs(app);
    await registerSocket(app);

    await app.register(multipart, {
        attachFieldsToBody: true,
        limits: {
            fileSize: 30 * 1024 * 1024,
        },
    });

    if (rateLimit) {
        await app.register(fastifyRateLimit, {
            global: true,
            max: rateLimit.max,
            timeWindow: rateLimit.timeWindow,
            keyGenerator: (request) => request.ip,
            errorResponseBuilder: (request, context) => {
                return {
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded. Retry in ${context.after} seconds`,
                    trustProxy: true
                }
            }
        });
    }

    await app.register(authRoutes, { prefix: "/auth" });
    await app.register(sessionRoutes, { prefix: "/session" });
    await app.register(userRoutes, { prefix: "/user" });
    await app.register(audioRoutes, { prefix: "/audio" });

    return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
