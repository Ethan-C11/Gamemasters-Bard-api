import type {Server as HttpServer} from "node:http";
import {Server, type Socket} from "socket.io";

export class SocketIOAdapter {

    private _io: Server;

    constructor(httpServer: HttpServer, corsOrigin?: string) {
        this._io = new Server(httpServer, corsOrigin ? { cors: { origin: corsOrigin } } : undefined);
    }

    static roomOf(sessionId: number): string {
        return `session:${sessionId}`;
    }

    useMiddleware(middleware: (socket: Socket, next: (err?: Error) => void) => void): void {
        this._io.use(middleware);
    }

    onConnection(handler: (socket: Socket) => void): void {
        this._io.on("connection", handler);
    }

    emitToSession(sessionId: number, event: string, payload: unknown): void {
        this._io.to(SocketIOAdapter.roomOf(sessionId)).emit(event, payload);
    }

    async close(): Promise<void> {
        await new Promise<void>((resolve) => this._io.close(() => resolve()));
    }
}
