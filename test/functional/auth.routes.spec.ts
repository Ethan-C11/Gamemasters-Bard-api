import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { createTestApp } from "../helpers/app.js";
import { makeUser } from "../helpers/factories.js";
import type { App } from "../../src/app.js";
import { SignUpUseCase } from "../../src/application/useCases/auth/SignUpUseCase.js";
import { SignInUseCase } from "../../src/application/useCases/auth/SignInUseCase.js";
import { IssueRefreshTokenUseCase } from "../../src/application/useCases/auth/IssueRefreshTokenUseCase.js";
import { RefreshAccessTokenUseCase } from "../../src/application/useCases/auth/RefreshAccessTokenUseCase.js";
import { AccountActivationUseCase } from "../../src/application/useCases/user/AccountActivationUseCase.js";
import { RequestPasswordResetUseCase } from "../../src/application/useCases/auth/RequestPasswordResetUseCase.js";
import { ResetPasswordUseCase } from "../../src/application/useCases/auth/ResetPasswordUseCase.js";
import { buildApp } from "../../src/app.js";
import { Role } from "../../src/shared/enums/Role.js";

let app: App;

beforeAll(async () => {
    app = await createTestApp();
});

afterAll(async () => {
    await app.close();
});

const credentials = { email: "gm@gm-test.test", username: "bard", password: "password123" };

describe("POST /auth/signup", () => {
    it("creates the account and returns tokens", async () => {
        vi.spyOn(SignUpUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ id: 3 }));
        vi.spyOn(IssueRefreshTokenUseCase.getInstance(), "execute").mockResolvedValueOnce("refresh-token");

        const res = await app.inject({ method: "POST", url: "/auth/signup", payload: credentials });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.refreshToken).toBe("refresh-token");
        expect(body.user).toEqual({ id: 3, email: "gm@gm-test.test", username: "gamemaster" });
        expect(app.jwt.verify<{ id: number; role: Role }>(body.token)).toMatchObject({ id: 3, role: Role.USER });
        expect(SignUpUseCase.getInstance().execute).toHaveBeenCalledWith("gm@gm-test.test", "bard", "password123");
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(SignUpUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Email is already used"));

        const res = await app.inject({ method: "POST", url: "/auth/signup", payload: credentials });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "Email is already used" });
    });

    it.each([
        ["an invalid email", { ...credentials, email: "not-an-email" }],
        ["a short username", { ...credentials, username: "ab" }],
        ["a short password", { ...credentials, password: "short" }],
        ["a missing field", { email: credentials.email, password: credentials.password }],
    ])("rejects %s", async (_label, payload) => {
        const spy = vi.spyOn(SignUpUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "POST", url: "/auth/signup", payload });

        expect(res.statusCode).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("POST /auth/signin", () => {
    it("returns an access token, a refresh token and the user", async () => {
        vi.spyOn(SignInUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ id: 4, role: Role.ADMIN }));
        vi.spyOn(IssueRefreshTokenUseCase.getInstance(), "execute").mockResolvedValueOnce("refresh-token");

        const res = await app.inject({ method: "POST", url: "/auth/signin", payload: { email: credentials.email, password: "password123" } });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.refreshToken).toBe("refresh-token");
        expect(app.jwt.verify<{ id: number; role: Role }>(body.token)).toMatchObject({ id: 4, role: Role.ADMIN });
    });

    it("answers 401 on bad credentials", async () => {
        vi.spyOn(SignInUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Invalid email or password"));

        const res = await app.inject({ method: "POST", url: "/auth/signin", payload: { email: credentials.email, password: "nope" } });

        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: "Invalid email or password" });
    });

    it("rejects a body without email", async () => {
        const res = await app.inject({ method: "POST", url: "/auth/signin", payload: { password: "x" } });

        expect(res.statusCode).toBe(400);
    });
});

describe("POST /auth/refresh", () => {
    it("returns a new access token and the rotated refresh token", async () => {
        vi.spyOn(RefreshAccessTokenUseCase.getInstance(), "execute").mockResolvedValueOnce({ user: makeUser({ id: 5 }), newRawRefreshToken: "new-refresh" });

        const res = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: "old-refresh" } });

        expect(res.statusCode).toBe(200);
        expect(res.json().refreshToken).toBe("new-refresh");
        expect(app.jwt.verify<{ id: number }>(res.json().token).id).toBe(5);
        expect(RefreshAccessTokenUseCase.getInstance().execute).toHaveBeenCalledWith("old-refresh");
    });

    it("answers 401 on an invalid refresh token", async () => {
        vi.spyOn(RefreshAccessTokenUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Invalid refresh token"));

        const res = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: "bad" } });

        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: "Invalid refresh token" });
    });
});

describe("POST /auth/activate", () => {
    it("activates the account", async () => {
        vi.spyOn(AccountActivationUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ id: 6 }));

        const res = await app.inject({ method: "POST", url: "/auth/activate", payload: { token: "raw", password: "aVeryLongPassword" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ user: { id: 6, email: "gm@gm-test.test", username: "gamemaster" } });
    });

    it("answers 401 on an invalid token", async () => {
        vi.spyOn(AccountActivationUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Invalid token"));

        const res = await app.inject({ method: "POST", url: "/auth/activate", payload: { token: "raw", password: "aVeryLongPassword" } });

        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: "Invalid token" });
    });

    it("requires a 12 characters password", async () => {
        const res = await app.inject({ method: "POST", url: "/auth/activate", payload: { token: "raw", password: "short" } });

        expect(res.statusCode).toBe(400);
    });
});

describe("POST /auth/forgot-password", () => {
    const genericMessage = { message: "If an account exists for this email, a reset link has been sent" };

    it("requests a reset and answers with a generic message", async () => {
        const execute = vi.spyOn(RequestPasswordResetUseCase.getInstance(), "execute").mockResolvedValueOnce(undefined);

        const res = await app.inject({ method: "POST", url: "/auth/forgot-password", payload: { email: "gm@gm-test.test" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(genericMessage);
        expect(execute).toHaveBeenCalledWith("gm@gm-test.test");
    });

    it("answers the same message when the reset fails", async () => {
        vi.spyOn(RequestPasswordResetUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("SMTP down"));

        const res = await app.inject({ method: "POST", url: "/auth/forgot-password", payload: { email: "gm@gm-test.test" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(genericMessage);
    });

    it("rejects an invalid email", async () => {
        const execute = vi.spyOn(RequestPasswordResetUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "POST", url: "/auth/forgot-password", payload: { email: "not-an-email" } });

        expect(res.statusCode).toBe(400);
        expect(execute).not.toHaveBeenCalled();
    });

    it("is limited to 5 requests per minute", async () => {
        const limitedApp = await buildApp({ logger: false, rateLimit: { max: 100, timeWindow: "1 minute" } });
        vi.spyOn(RequestPasswordResetUseCase.getInstance(), "execute").mockResolvedValue(undefined);

        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) {
            const res = await limitedApp.inject({ method: "POST", url: "/auth/forgot-password", payload: { email: "gm@gm-test.test" } });
            statuses.push(res.statusCode);
        }
        await limitedApp.close();

        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });
});

describe("POST /auth/reset-password", () => {
    it("updates the password", async () => {
        const execute = vi.spyOn(ResetPasswordUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser());

        const res = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token: "raw", password: "newpass1" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ message: "Password updated" });
        expect(execute).toHaveBeenCalledWith("raw", "newpass1");
    });

    it("answers 400 on an invalid token", async () => {
        vi.spyOn(ResetPasswordUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Invalid token"));

        const res = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token: "raw", password: "newpass1" } });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "Invalid token" });
    });

    it("requires an 8 characters password", async () => {
        const execute = vi.spyOn(ResetPasswordUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token: "raw", password: "short" } });

        expect(res.statusCode).toBe(400);
        expect(execute).not.toHaveBeenCalled();
    });

    it("requires a token", async () => {
        const res = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { password: "newpass1" } });

        expect(res.statusCode).toBe(400);
    });
});
