import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";

export async function registerJwt(app: FastifyInstance) {
    await app.register(fastifyJwt, {
        secret: process.env.JWT_SECRET!,
        sign: {
            expiresIn: "15m",
        },
    });
}