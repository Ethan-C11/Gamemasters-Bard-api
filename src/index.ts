import 'reflect-metadata'
import 'dotenv/config'
import Fastify from 'fastify'
import multipart from "@fastify/multipart";
import {AppDataSource} from "./infrastructure/db/AppDataSource.js";
import {registerJwt} from "./presentation/http/plugins/jwt.plugin.js";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {registerDocs} from "./presentation/http/plugins/docs.plugin.js";
import {authRoutes} from "./presentation/http/routes/auth.routes.js";
import {sessionRoutes} from "./presentation/http/routes/session.routes.js";
import {userRoutes} from "./presentation/http/routes/user.routes.js";
import {audioRoutes} from "./presentation/http/routes/audio.routes.js";
import {MinioStorageService} from "./infrastructure/storage/MinioStorageService.js";
import fastifyRateLimit from "@fastify/rate-limit";

const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()
await registerJwt(fastify);
await registerDocs(fastify);

await fastify.register(multipart, {
    attachFieldsToBody: true,
    limits: {
        fileSize: 30 * 1024 * 1024,
    },
});

await fastify.register(fastifyRateLimit, {
    max: 30,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip
})

await fastify.register(authRoutes, { prefix: "/auth" });
await fastify.register(sessionRoutes, { prefix: "/session" });
await fastify.register(userRoutes, { prefix: "/user" });
await fastify.register(audioRoutes, { prefix: "/audio" });

await MinioStorageService.getInstance().ensureBucketExists();

const start = async () => {
    try {
        await AppDataSource.initialize()
        fastify.log.info('Database connected')

        await fastify.listen({
            port: Number(process.env.PORT ?? 3001),
            host: process.env.HOST ?? '127.0.0.1'
        })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()