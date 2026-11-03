import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { bearer, createTestApp, tokenFor } from "../helpers/app.js";
import { makeUser } from "../helpers/factories.js";
import type { App } from "../../src/app.js";
import { EditUserUseCase } from "../../src/application/useCases/user/EditUserUseCase.js";
import { DeleteUserUseCase } from "../../src/application/useCases/user/DeleteUserUseCase.js";
import { CreateUserWithRoleUseCase } from "../../src/application/useCases/user/CreateUserWithRoleUseCase.js";
import { Role } from "../../src/shared/enums/Role.js";

let app: App;
let userToken: string;
let adminToken: string;

beforeAll(async () => {
    app = await createTestApp();
    userToken = tokenFor(app, Role.USER, 1);
    adminToken = tokenFor(app, Role.ADMIN, 9);
});

afterAll(async () => {
    await app.close();
});

describe("PUT /user", () => {
    it("edits the connected user", async () => {
        vi.spyOn(EditUserUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ username: "renamed" }));

        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer(userToken), payload: { username: "renamed", password: "newPassword1" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ user: { id: 1, email: "gm@gm-test.test", username: "renamed" } });
        expect(EditUserUseCase.getInstance().execute).toHaveBeenCalledWith(1, "renamed", undefined, "newPassword1");
    });

    it.each([Role.SOUND_CREATOR, Role.ADMIN])("is allowed for %s", async (role) => {
        vi.spyOn(EditUserUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser());

        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer(tokenFor(app, role)), payload: {} });

        expect(res.statusCode).toBe(200);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(EditUserUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User not found"));

        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer(userToken), payload: {} });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "User not found" });
    });

    it("validates the body", async () => {
        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer(userToken), payload: { email: "nope" } });

        expect(res.statusCode).toBe(400);
    });

    it("requires authentication", async () => {
        const res = await app.inject({ method: "PUT", url: "/user", payload: {} });

        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: "Unauthorized" });
    });

    it("refuses an invalid token", async () => {
        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer("not.a.jwt"), payload: {} });

        expect(res.statusCode).toBe(401);
    });

    it("refuses the guest role", async () => {
        const res = await app.inject({ method: "PUT", url: "/user", headers: bearer(tokenFor(app, Role.GUEST)), payload: {} });

        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: "Forbidden" });
    });
});

describe("DELETE /user", () => {
    it("deletes the connected user", async () => {
        vi.spyOn(DeleteUserUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser());

        const res = await app.inject({ method: "DELETE", url: "/user", headers: bearer(userToken) });

        expect(res.statusCode).toBe(200);
        expect(DeleteUserUseCase.getInstance().execute).toHaveBeenCalledWith(1);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(DeleteUserUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User not found"));

        const res = await app.inject({ method: "DELETE", url: "/user", headers: bearer(userToken) });

        expect(res.statusCode).toBe(400);
    });
});

describe("DELETE /user/admin/:id", () => {
    it("lets an admin delete any account", async () => {
        vi.spyOn(DeleteUserUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ id: 42 }));

        const res = await app.inject({ method: "DELETE", url: "/user/admin/42", headers: bearer(adminToken) });

        expect(res.statusCode).toBe(200);
        expect(res.json().user.id).toBe(42);
        expect(DeleteUserUseCase.getInstance().execute).toHaveBeenCalledWith(42);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(DeleteUserUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User not found"));

        const res = await app.inject({ method: "DELETE", url: "/user/admin/42", headers: bearer(adminToken) });

        expect(res.statusCode).toBe(400);
    });

    it("refuses a non numeric id", async () => {
        const res = await app.inject({ method: "DELETE", url: "/user/admin/abc", headers: bearer(adminToken) });

        expect(res.statusCode).toBe(400);
    });

    it.each([Role.USER, Role.SOUND_CREATOR])("is forbidden for %s", async (role) => {
        const res = await app.inject({ method: "DELETE", url: "/user/admin/42", headers: bearer(tokenFor(app, role)) });

        expect(res.statusCode).toBe(403);
    });
});

describe("POST /user/admin/create-user", () => {
    const payload = { email: "staff@gm-test.test", username: "staff", role: Role.SOUND_CREATOR, adminToken: "creator-secret" };

    it("lets an admin create a special role account", async () => {
        vi.spyOn(CreateUserWithRoleUseCase.getInstance(), "execute").mockResolvedValueOnce(makeUser({ id: 50, email: payload.email, username: "staff" }));

        const res = await app.inject({ method: "POST", url: "/user/admin/create-user", headers: bearer(adminToken), payload });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ user: { id: 50, email: payload.email, username: "staff" } });
        expect(CreateUserWithRoleUseCase.getInstance().execute).toHaveBeenCalledWith(payload.email, "staff", Role.SOUND_CREATOR, "creator-secret");
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(CreateUserWithRoleUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Token has not match"));

        const res = await app.inject({ method: "POST", url: "/user/admin/create-user", headers: bearer(adminToken), payload });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "Token has not match" });
    });

    it("is forbidden for a regular user", async () => {
        const res = await app.inject({ method: "POST", url: "/user/admin/create-user", headers: bearer(userToken), payload });

        expect(res.statusCode).toBe(403);
    });
});
