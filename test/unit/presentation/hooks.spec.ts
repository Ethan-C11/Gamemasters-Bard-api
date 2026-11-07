import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authenticate } from "../../../src/presentation/http/hooks/authenticate.js";
import { authorize } from "../../../src/presentation/http/hooks/authorize.js";
import { registerJwt } from "../../../src/presentation/http/plugins/jwt.plugin.js";
import { Role } from "../../../src/shared/enums/Role.js";

function fakeReply() {
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    reply.send.mockReturnValue(reply);
    return reply;
}

describe("authenticate", () => {
    it("lets a request with a valid token through", async () => {
        const reply = fakeReply();
        const request = { jwtVerify: vi.fn(async () => ({})) };

        await authenticate(request as unknown as FastifyRequest, reply as unknown as FastifyReply);

        expect(reply.status).not.toHaveBeenCalled();
    });

    it("answers 401 when the token is missing or invalid", async () => {
        const reply = fakeReply();
        const request = { jwtVerify: vi.fn(async () => { throw new Error("bad token"); }) };

        await authenticate(request as unknown as FastifyRequest, reply as unknown as FastifyReply);

        expect(reply.status).toHaveBeenCalledWith(401);
        expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
    });
});

describe("authorize", () => {
    it("lets an allowed role through", async () => {
        const reply = fakeReply();

        await authorize(Role.USER, Role.ADMIN)({ user: { role: Role.ADMIN } } as FastifyRequest, reply as unknown as FastifyReply);

        expect(reply.status).not.toHaveBeenCalled();
    });

    it("answers 403 for another role", async () => {
        const reply = fakeReply();

        await authorize(Role.ADMIN)({ user: { role: Role.USER } } as FastifyRequest, reply as unknown as FastifyReply);

        expect(reply.status).toHaveBeenCalledWith(403);
        expect(reply.send).toHaveBeenCalledWith({ error: "Forbidden" });
    });
});

describe("registerJwt", () => {
    it("signs tokens with the secret that expire after 15 minutes", async () => {
        const app = Fastify();
        await registerJwt(app);
        await app.ready();

        const token = app.jwt.sign({ id: 1, email: "gm@gm-test.test", role: Role.USER });
        const decoded = app.jwt.verify<{ id: number; iat: number; exp: number }>(token);

        expect(decoded.id).toBe(1);
        expect(decoded.exp - decoded.iat).toBe(15 * 60);
        await app.close();
    });
});
