import type {FastifyInstance} from "fastify";
import {SocketIOAdapter} from "../../infrastructure/realtime/SocketIOAdapter.js";
import {JwtPayload} from "../../shared/types/jwt-payload.js";
import {registerSessionHandlers} from "./handlers/session.handler.js";
import {registerPlaybackHandlers} from "./handlers/playback.handler.js";

declare module "fastify" {
    interface FastifyInstance {
        realtime: SocketIOAdapter;
    }
}

export async function registerSocket(app: FastifyInstance) {
    const adapter = new SocketIOAdapter(app.server, process.env.FRONTEND_URL);

    adapter.useMiddleware((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string")
            return next(new Error("Unauthorized"));

        try {
            socket.data.user = app.jwt.verify<JwtPayload>(token);
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    adapter.onConnection((socket) => {
        registerSessionHandlers(socket);
        registerPlaybackHandlers(adapter, socket);
    });

    app.decorate("realtime", adapter);
    app.addHook("onClose", async () => {
        await adapter.close();
    });
}
