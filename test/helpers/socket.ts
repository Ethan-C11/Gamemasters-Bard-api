import { io, type Socket } from "socket.io-client";

export function connectSocket(baseUrl: string, token?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(baseUrl, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false });
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", (err) => {
            socket.close();
            reject(err);
        });
    });
}

export function waitForEvent<T = any>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no "${event}" event received`)), timeoutMs);
        socket.once(event, (payload: T) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

export async function expectNoEvent(socket: Socket, event: string, waitMs = 250): Promise<void> {
    let received = false;
    const listener = () => { received = true; };
    socket.on(event, listener);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    socket.off(event, listener);
    if (received) throw new Error(`unexpected "${event}" event received`);
}

export function emitWithAck<T = any>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return socket.emitWithAck(event, payload);
}
