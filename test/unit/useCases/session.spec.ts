import { describe, expect, it } from "vitest";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { makeSession, makeTrack, makeUser } from "../../helpers/factories.js";
import { Zone } from "../../../src/shared/enums/Zone.js";
import { Ambiance } from "../../../src/shared/enums/Ambiance.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { Session } from "../../../src/infrastructure/db/entities/session.entity.js";
import { CreateSessionUseCase } from "../../../src/application/useCases/session/CreateSessionUseCase.js";
import { DeleteSessionUseCase } from "../../../src/application/useCases/session/DeleteSessionUseCase.js";
import { JoinSessionUseCase } from "../../../src/application/useCases/session/JoinSessionUseCase.js";
import { QuitSessionUseCase } from "../../../src/application/useCases/session/QuitSessionUseCase.js";
import { GetSessionStateUseCase } from "../../../src/application/useCases/session/GetSessionStateUseCase.js";
import { toSessionDto, toSessionStateDto } from "../../../src/application/mappers/session.mappers.js";

const users = repositoryFor(User);
const sessions = repositoryFor(Session);

describe("CreateSessionUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(CreateSessionUseCase.getInstance()).toBe(CreateSessionUseCase.getInstance());
    });

    it("creates a session owned by the user with a 6 characters invite code", async () => {
        const owner = makeUser();
        users.findOneBy.mockResolvedValueOnce(owner);

        const session = await CreateSessionUseCase.getInstance().execute(owner.id, "Campaign");

        expect(session.owner).toBe(owner);
        expect(session.sessionName).toBe("Campaign");
        expect(session.inviteCode).toMatch(/^[A-Za-z0-9]{6}$/);
        expect(session.sessionMembers).toEqual([owner]);
    });

    it("draws a new invite code when the first one is taken", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());
        sessions.findOneBy.mockResolvedValueOnce(makeSession()).mockResolvedValueOnce(null);

        await CreateSessionUseCase.getInstance().execute(1, "Campaign");

        expect(sessions.findOneBy).toHaveBeenCalledTimes(2);
    });

    it("rejects an unknown owner", async () => {
        await expect(CreateSessionUseCase.getInstance().execute(99, "Campaign")).rejects.toThrow("User does not exist");
    });

    it("refuses a second open session for the same owner", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());
        sessions.exists.mockResolvedValueOnce(true);

        await expect(CreateSessionUseCase.getInstance().execute(1, "Campaign")).rejects.toThrow("Owner already has a open session");
        expect(sessions.save).not.toHaveBeenCalled();
    });
});

describe("DeleteSessionUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(DeleteSessionUseCase.getInstance()).toBe(DeleteSessionUseCase.getInstance());
    });

    it("deletes the session of its owner and returns a snapshot", async () => {
        const owner = makeUser();
        const session = makeSession({ owner });
        users.findOneBy.mockResolvedValueOnce(owner);
        sessions.findOne.mockResolvedValueOnce(session);

        const snapshot = await DeleteSessionUseCase.getInstance().execute(session.id, owner.id);

        expect(sessions.remove).toHaveBeenCalledWith(session);
        expect(snapshot).toMatchObject({ id: session.id, sessionName: session.sessionName });
    });

    it("lets the system bypass the ownership check", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 2 }));
        sessions.findOne.mockResolvedValueOnce(makeSession());

        await DeleteSessionUseCase.getInstance().execute(10, 2, true);

        expect(sessions.remove).toHaveBeenCalledOnce();
    });

    it("rejects an unknown actor", async () => {
        await expect(DeleteSessionUseCase.getInstance().execute(10, 99)).rejects.toThrow("User does not exist");
    });

    it("rejects an unknown session", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        await expect(DeleteSessionUseCase.getInstance().execute(10, 1)).rejects.toThrow("Session does not exist");
    });

    it("refuses a non owner", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 2 }));
        sessions.findOne.mockResolvedValueOnce(makeSession());

        await expect(DeleteSessionUseCase.getInstance().execute(10, 2)).rejects.toThrow("User is not the owner of the session");
        expect(sessions.remove).not.toHaveBeenCalled();
    });
});

describe("JoinSessionUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(JoinSessionUseCase.getInstance()).toBe(JoinSessionUseCase.getInstance());
    });

    it("adds the user to the session members", async () => {
        const player = makeUser({ id: 2 });
        sessions.findOne.mockResolvedValueOnce(makeSession());
        users.findOneBy.mockResolvedValueOnce(player);

        const session = await JoinSessionUseCase.getInstance().execute("ABC123", player.id);

        expect(sessions.findOne).toHaveBeenCalledWith({ where: { inviteCode: "ABC123" }, relations: { owner: true, sessionMembers: true } });
        expect(session.sessionMembers.map((m) => m.id)).toEqual([1, 2]);
    });

    it("handles a session loaded without members", async () => {
        sessions.findOne.mockResolvedValueOnce(makeSession({ sessionMembers: undefined as never }));
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 2 }));

        const session = await JoinSessionUseCase.getInstance().execute("ABC123", 2);

        expect(session.sessionMembers.map((m) => m.id)).toEqual([2]);
    });

    it("rejects an unknown invite code", async () => {
        await expect(JoinSessionUseCase.getInstance().execute("ZZZZZZ", 2))
            .rejects.toThrow("Could not find a session with the Invite Code ZZZZZZ");
    });

    it("rejects an unknown user", async () => {
        sessions.findOne.mockResolvedValueOnce(makeSession());

        await expect(JoinSessionUseCase.getInstance().execute("ABC123", 99)).rejects.toThrow("User not found");
    });

    it("refuses a user who is already a member", async () => {
        sessions.findOne.mockResolvedValueOnce(makeSession());
        users.findOneBy.mockResolvedValueOnce(makeUser());

        await expect(JoinSessionUseCase.getInstance().execute("ABC123", 1)).rejects.toThrow("User is already a member of this session");
    });
});

describe("QuitSessionUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(QuitSessionUseCase.getInstance()).toBe(QuitSessionUseCase.getInstance());
    });

    it("removes a member from the session", async () => {
        const owner = makeUser();
        const player = makeUser({ id: 2 });
        users.findOneBy.mockResolvedValueOnce(player);
        sessions.findOne.mockResolvedValueOnce(makeSession({ owner, sessionMembers: [owner, player] }));

        const session = await QuitSessionUseCase.getInstance().execute(10, 2);

        expect(session.sessionMembers.map((m) => m.id)).toEqual([1]);
        expect(sessions.save).toHaveBeenCalledOnce();
    });

    it("deletes the session when the owner quits with forceDelete", async () => {
        const owner = makeUser();
        const session = makeSession({ owner });
        users.findOneBy.mockResolvedValue(owner);
        sessions.findOne.mockResolvedValue(session);

        await QuitSessionUseCase.getInstance().execute(10, 1, true);

        expect(sessions.remove).toHaveBeenCalledWith(session);
    });

    it("refuses that the owner quits without forceDelete", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());
        sessions.findOne.mockResolvedValueOnce(makeSession());

        await expect(QuitSessionUseCase.getInstance().execute(10, 1))
            .rejects.toThrow("User cannot quit his own session unless forceDelete is activated");
    });

    it("rejects an unknown actor", async () => {
        await expect(QuitSessionUseCase.getInstance().execute(10, 99)).rejects.toThrow("User does not exist");
    });

    it("rejects an unknown session", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 2 }));

        await expect(QuitSessionUseCase.getInstance().execute(10, 2)).rejects.toThrow("Session does not exist");
    });

    it("refuses a user who is not a member", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 3 }));
        sessions.findOne.mockResolvedValueOnce(makeSession({ sessionMembers: undefined as never }));

        await expect(QuitSessionUseCase.getInstance().execute(10, 3)).rejects.toThrow("User is not a member of this session");
    });
});

describe("toSessionDto", () => {
    it("maps a session to its public representation", () => {
        const owner = makeUser();
        const player = makeUser({ id: 2, username: "player" });

        expect(toSessionDto(makeSession({ owner, sessionMembers: [owner, player] }))).toEqual({
            id: 10,
            sessionName: "Campaign",
            inviteCode: "ABC123",
            createdAt: "2026-01-01T00:00:00.000Z",
            owner: { id: 1, username: "gamemaster" },
            sessionMembers: [{ id: 1, username: "gamemaster" }, { id: 2, username: "player" }],
        });
    });

    it("returns an empty member list when members are not loaded", () => {
        expect(toSessionDto(makeSession({ sessionMembers: undefined as never })).sessionMembers).toEqual([]);
    });
});

describe("GetSessionStateUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(GetSessionStateUseCase.getInstance()).toBe(GetSessionStateUseCase.getInstance());
    });

    it("loads the session with its owner, members and current sounds", async () => {
        const session = makeSession();
        sessions.findOne.mockResolvedValueOnce(session);

        const result = await GetSessionStateUseCase.getInstance().execute(10, 1);

        expect(result).toBe(session);
        expect(sessions.findOne).toHaveBeenCalledWith({
            where: { id: 10 },
            relations: { owner: true, sessionMembers: true, currentMusic: true, currentEnvironment: true },
        });
    });

    it("lets a member read the state", async () => {
        const owner = makeUser();
        const player = makeUser({ id: 2 });
        sessions.findOne.mockResolvedValueOnce(makeSession({ owner, sessionMembers: [owner, player] }));

        await expect(GetSessionStateUseCase.getInstance().execute(10, 2)).resolves.toBeDefined();
    });

    it("refuses a user who is not in the session", async () => {
        sessions.findOne.mockResolvedValueOnce(makeSession());

        await expect(GetSessionStateUseCase.getInstance().execute(10, 3)).rejects.toThrow("User is not a member of this session");
    });

    it("refuses a session that does not exist", async () => {
        await expect(GetSessionStateUseCase.getInstance().execute(10, 1)).rejects.toThrow("Session does not exist");
    });

    it("refuses a user when the members are not loaded", async () => {
        sessions.findOne.mockResolvedValueOnce(makeSession({ sessionMembers: undefined as never }));

        await expect(GetSessionStateUseCase.getInstance().execute(10, 3)).rejects.toThrow("User is not a member of this session");
    });
});

describe("toSessionStateDto", () => {
    it("maps the current sounds, filters and start date", () => {
        const music = makeTrack({ id: 1 });
        const state = toSessionStateDto(makeSession({
            currentMusic: music,
            currentEnvironment: null,
            currentZone: Zone.FOREST,
            currentAmbiance: Ambiance.CALM,
            playbackStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));

        expect(state).toEqual({
            music: { key: music.storageKey, name: music.name, type: music.type, zone: music.zone, ambiance: music.ambiance, isUserImported: false },
            environment: null,
            zone: Zone.FOREST,
            ambiance: Ambiance.CALM,
            startedAt: "2026-01-01T00:00:00.000Z",
            status: "stopped",
            positionMs: 0,
        });
    });

    it("returns an empty state for a session that never played anything", () => {
        expect(toSessionStateDto(makeSession())).toEqual({ music: null, environment: null, zone: null, ambiance: null, startedAt: null, status: "stopped", positionMs: 0 });
    });
});
