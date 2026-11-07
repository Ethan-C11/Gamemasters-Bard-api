import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { bearer, createTestApp, tokenFor } from "../helpers/app.js";
import { makeSession, makeTrack, makeUser } from "../helpers/factories.js";
import { Zone } from "../../src/shared/enums/Zone.js";
import { Ambiance } from "../../src/shared/enums/Ambiance.js";
import type { App } from "../../src/app.js";
import { CreateSessionUseCase } from "../../src/application/useCases/session/CreateSessionUseCase.js";
import { DeleteSessionUseCase } from "../../src/application/useCases/session/DeleteSessionUseCase.js";
import { JoinSessionUseCase } from "../../src/application/useCases/session/JoinSessionUseCase.js";
import { QuitSessionUseCase } from "../../src/application/useCases/session/QuitSessionUseCase.js";
import { GetSessionStateUseCase } from "../../src/application/useCases/session/GetSessionStateUseCase.js";
import { Role } from "../../src/shared/enums/Role.js";

let app: App;
let ownerToken: string;
let playerToken: string;

const expectedDto = {
    id: 10,
    sessionName: "Campaign",
    inviteCode: "ABC123",
    createdAt: "2026-01-01T00:00:00.000Z",
    owner: { id: 1, username: "gamemaster" },
    sessionMembers: [{ id: 1, username: "gamemaster" }],
};

beforeAll(async () => {
    app = await createTestApp();
    ownerToken = tokenFor(app, Role.USER, 1);
    playerToken = tokenFor(app, Role.USER, 2);
});

afterAll(async () => {
    await app.close();
});

describe("POST /session", () => {
    it("creates a session for the connected user", async () => {
        vi.spyOn(CreateSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        const res = await app.inject({ method: "POST", url: "/session", headers: bearer(ownerToken), payload: { sessionName: "Campaign" } });

        expect(res.statusCode).toBe(201);
        expect(res.json()).toEqual(expectedDto);
        expect(CreateSessionUseCase.getInstance().execute).toHaveBeenCalledWith(1, "Campaign");
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(CreateSessionUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Owner already has a open session"));

        const res = await app.inject({ method: "POST", url: "/session", headers: bearer(ownerToken), payload: { sessionName: "Campaign" } });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "Owner already has a open session" });
    });

    it("requires a session name", async () => {
        const res = await app.inject({ method: "POST", url: "/session", headers: bearer(ownerToken), payload: { sessionName: "" } });

        expect(res.statusCode).toBe(400);
    });

    it("is forbidden for a sound creator", async () => {
        const res = await app.inject({ method: "POST", url: "/session", headers: bearer(tokenFor(app, Role.SOUND_CREATOR)), payload: { sessionName: "x" } });

        expect(res.statusCode).toBe(403);
    });

    it("requires authentication", async () => {
        const res = await app.inject({ method: "POST", url: "/session", payload: { sessionName: "x" } });

        expect(res.statusCode).toBe(401);
    });
});

describe("DELETE /session/:id", () => {
    it("deletes the session", async () => {
        vi.spyOn(DeleteSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        const res = await app.inject({ method: "DELETE", url: "/session/10", headers: bearer(ownerToken) });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(expectedDto);
        expect(DeleteSessionUseCase.getInstance().execute).toHaveBeenCalledWith(10, 1);
    });

    it("answers 400 when the user is not the owner", async () => {
        vi.spyOn(DeleteSessionUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not the owner of the session"));

        const res = await app.inject({ method: "DELETE", url: "/session/10", headers: bearer(playerToken) });

        expect(res.statusCode).toBe(400);
    });

    it("refuses a non numeric id", async () => {
        const res = await app.inject({ method: "DELETE", url: "/session/abc", headers: bearer(ownerToken) });

        expect(res.statusCode).toBe(400);
    });
});

describe("POST /session/join", () => {
    it("joins a session with its invite code", async () => {
        const owner = makeUser();
        const player = makeUser({ id: 2, username: "player" });
        vi.spyOn(JoinSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession({ owner, sessionMembers: [owner, player] }));

        const res = await app.inject({ method: "POST", url: "/session/join", headers: bearer(playerToken), payload: { inviteCode: "ABC123" } });

        expect(res.statusCode).toBe(200);
        expect(res.json().sessionMembers).toEqual([{ id: 1, username: "gamemaster" }, { id: 2, username: "player" }]);
        expect(JoinSessionUseCase.getInstance().execute).toHaveBeenCalledWith("ABC123", 2);
    });

    it("is open to guests", async () => {
        vi.spyOn(JoinSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        const res = await app.inject({ method: "POST", url: "/session/join", headers: bearer(tokenFor(app, Role.GUEST, 3)), payload: { inviteCode: "ABC123" } });

        expect(res.statusCode).toBe(200);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(JoinSessionUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("Could not find a session with the Invite Code ZZZZZZ"));

        const res = await app.inject({ method: "POST", url: "/session/join", headers: bearer(playerToken), payload: { inviteCode: "ZZZZZZ" } });

        expect(res.statusCode).toBe(400);
    });

    it.each(["ABC12", "ABC1234"])("refuses an invite code that is not 6 characters (%s)", async (inviteCode) => {
        const res = await app.inject({ method: "POST", url: "/session/join", headers: bearer(playerToken), payload: { inviteCode } });

        expect(res.statusCode).toBe(400);
    });
});

describe("POST /session/quit/:id", () => {
    it("quits the session", async () => {
        vi.spyOn(QuitSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        const res = await app.inject({ method: "POST", url: "/session/quit/10", headers: bearer(playerToken), payload: {} });

        expect(res.statusCode).toBe(200);
        expect(QuitSessionUseCase.getInstance().execute).toHaveBeenCalledWith(10, 2, false);
    });

    it("forwards forceDelete", async () => {
        vi.spyOn(QuitSessionUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession());

        await app.inject({ method: "POST", url: "/session/quit/10", headers: bearer(ownerToken), payload: { forceDelete: true } });

        expect(QuitSessionUseCase.getInstance().execute).toHaveBeenCalledWith(10, 1, true);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(QuitSessionUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not a member of this session"));

        const res = await app.inject({ method: "POST", url: "/session/quit/10", headers: bearer(playerToken), payload: {} });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "User is not a member of this session" });
    });
});

describe("GET /session/:id/state", () => {
    it("returns the current state of the session", async () => {
        const music = makeTrack();
        const execute = vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockResolvedValueOnce(makeSession({
            currentMusic: music,
            currentZone: Zone.FOREST,
            currentAmbiance: Ambiance.CALM,
            playbackStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));

        const res = await app.inject({ method: "GET", url: "/session/10/state", headers: bearer(playerToken) });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            music: { key: music.storageKey, name: music.name, type: music.type, zone: music.zone, ambiance: music.ambiance, isUserImported: false },
            environment: null,
            zone: Zone.FOREST,
            ambiance: Ambiance.CALM,
            startedAt: "2026-01-01T00:00:00.000Z",
            status: "stopped",
            positionMs: 0,
        });
        expect(execute).toHaveBeenCalledWith(10, 2);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(GetSessionStateUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User is not a member of this session"));

        const res = await app.inject({ method: "GET", url: "/session/10/state", headers: bearer(playerToken) });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "User is not a member of this session" });
    });

    it("requires authentication", async () => {
        const execute = vi.spyOn(GetSessionStateUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "GET", url: "/session/10/state" });

        expect(res.statusCode).toBe(401);
        expect(execute).not.toHaveBeenCalled();
    });
});
