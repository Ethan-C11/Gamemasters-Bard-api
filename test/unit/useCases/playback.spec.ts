import { describe, expect, it, vi, afterEach } from "vitest";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { makeSession, makeTrack, makeUser } from "../../helpers/factories.js";
import { Session } from "../../../src/infrastructure/db/entities/session.entity.js";
import { TriggerPlaybackUseCase } from "../../../src/application/useCases/playback/TriggerPlaybackUseCase.js";
import { PlaybackAction } from "../../../src/shared/enums/PlaybackAction.js";
import { PlaybackStatus } from "../../../src/shared/enums/PlaybackStatus.js";

const sessions = repositoryFor(Session);

afterEach(() => {
    vi.useRealTimers();
});

describe("TriggerPlaybackUseCase", () => {
    const owner = makeUser();
    const execute = (action: PlaybackAction, actorId = owner.id) => TriggerPlaybackUseCase.getInstance().execute(10, actorId, action);
    const givenSession = (overrides = {}) => {
        const session = makeSession({ owner, currentMusic: makeTrack(), ...overrides });
        sessions.findOne.mockResolvedValueOnce(session);
        return session;
    };

    it("returns the same singleton instance", () => {
        expect(TriggerPlaybackUseCase.getInstance()).toBe(TriggerPlaybackUseCase.getInstance());
    });

    it("loads the session with its owner and current sounds", async () => {
        givenSession();

        await execute(PlaybackAction.PLAY);

        expect(sessions.findOne).toHaveBeenCalledWith({
            where: { id: 10 },
            relations: { owner: true, currentMusic: true, currentEnvironment: true },
        });
    });

    it("starts a stopped session from the beginning", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const session = givenSession({ playbackPositionMs: 500 });

        const result = await execute(PlaybackAction.PLAY);

        expect(result.playbackStatus).toBe(PlaybackStatus.PLAYING);
        expect(result.playbackPositionMs).toBe(0);
        expect(result.playbackStartedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
        expect(sessions.save).toHaveBeenCalledWith(session);
    });

    it("plays with only an environment sound", async () => {
        givenSession({ currentMusic: null, currentEnvironment: makeTrack({ id: 2 }) });

        await expect(execute(PlaybackAction.PLAY)).resolves.toMatchObject({ playbackStatus: PlaybackStatus.PLAYING });
    });

    it("refuses to play when nothing was drawn", async () => {
        givenSession({ currentMusic: null });

        await expect(execute(PlaybackAction.PLAY)).rejects.toThrow("Nothing to play");
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it("keeps a session that is already playing untouched", async () => {
        givenSession({ playbackStatus: PlaybackStatus.PLAYING, playbackStartedAt: new Date(), playbackPositionMs: 100 });

        const result = await execute(PlaybackAction.PLAY);

        expect(result.playbackPositionMs).toBe(100);
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it("pauses a playing session and keeps the elapsed time", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
        givenSession({ playbackStatus: PlaybackStatus.PLAYING, playbackStartedAt: new Date("2026-01-01T00:00:04.000Z"), playbackPositionMs: 1000 });

        const result = await execute(PlaybackAction.PAUSE);

        expect(result.playbackStatus).toBe(PlaybackStatus.PAUSED);
        expect(result.playbackPositionMs).toBe(7000);
        expect(result.playbackStartedAt).toBeNull();
        expect(sessions.save).toHaveBeenCalledOnce();
    });

    it("ignores a pause when nothing is playing", async () => {
        givenSession({ playbackStatus: PlaybackStatus.PAUSED, playbackPositionMs: 300 });

        const result = await execute(PlaybackAction.PAUSE);

        expect(result.playbackPositionMs).toBe(300);
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it("resumes a paused session where it stopped", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
        givenSession({ playbackStatus: PlaybackStatus.PAUSED, playbackPositionMs: 7000 });

        const result = await execute(PlaybackAction.PLAY);

        expect(result.playbackStatus).toBe(PlaybackStatus.PLAYING);
        expect(result.playbackPositionMs).toBe(7000);
        expect(result.playbackStartedAt).toEqual(new Date("2026-01-01T00:01:00.000Z"));
    });

    it("stops a session and resets the position", async () => {
        givenSession({ playbackStatus: PlaybackStatus.PLAYING, playbackStartedAt: new Date(), playbackPositionMs: 4000 });

        const result = await execute(PlaybackAction.STOP);

        expect(result.playbackStatus).toBe(PlaybackStatus.STOPPED);
        expect(result.playbackPositionMs).toBe(0);
        expect(result.playbackStartedAt).toBeNull();
        expect(sessions.save).toHaveBeenCalledOnce();
    });

    it("refuses a user who is not the owner", async () => {
        givenSession();

        await expect(execute(PlaybackAction.PLAY, 2)).rejects.toThrow("User is not the owner of the session");
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it("refuses a session that does not exist", async () => {
        await expect(execute(PlaybackAction.PLAY)).rejects.toThrow("Session does not exist");
    });
});
