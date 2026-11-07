import { describe, expect, it, vi } from "vitest";
import { IsNull } from "typeorm";
import type { MultipartFile } from "@fastify/multipart";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { storageMock } from "../../helpers/mockStorage.js";
import { makeSession, makeTrack, makeUser } from "../../helpers/factories.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { Session } from "../../../src/infrastructure/db/entities/session.entity.js";
import { AudioTrack } from "../../../src/infrastructure/db/entities/audioTrack.entity.js";
import ImportAudioUseCase from "../../../src/application/useCases/audio/ImportAudioUseCase.js";
import ListAudioTracksUseCase from "../../../src/application/useCases/audio/ListAudioTracksUseCase.js";
import DeleteAudioTrackUseCase from "../../../src/application/useCases/audio/DeleteAudioTrackUseCase.js";
import DrawSessionSoundsUseCase from "../../../src/application/useCases/audio/DrawSessionSoundsUseCase.js";
import { SoundType } from "../../../src/shared/enums/SoundType.js";
import { PlaybackStatus } from "../../../src/shared/enums/PlaybackStatus.js";
import { Zone } from "../../../src/shared/enums/Zone.js";
import { Ambiance } from "../../../src/shared/enums/Ambiance.js";

const users = repositoryFor(User);
const sessions = repositoryFor(Session);
const tracks = repositoryFor(AudioTrack);

const MB = 1_000_000;

function fakeFile(overrides: { mimetype?: string; filename?: string; size?: number } = {}): MultipartFile {
    const { mimetype = "audio/mpeg", filename = "theme.mp3", size = 1024 } = overrides;
    return { mimetype, filename, toBuffer: async () => Buffer.alloc(size) } as unknown as MultipartFile;
}

describe("ImportAudioUseCase", () => {
    const importAudio = (file: MultipartFile | undefined, options: Partial<{ userId: number; type: SoundType; zone: Zone; ambiance: Ambiance; isUserImported: boolean }> = {}) => {
        const values = { userId: 1, type: SoundType.MUSIC, zone: Zone.FOREST, ambiance: Ambiance.CALM, isUserImported: true, ...options };
        return ImportAudioUseCase.getInstance().execute(values.userId, file, "Theme", values.type, values.zone, values.ambiance, values.isUserImported);
    };

    it("returns the same singleton instance", () => {
        expect(ImportAudioUseCase.getInstance()).toBe(ImportAudioUseCase.getInstance());
    });

    it("stores a private sound under the user folder and links the uploader", async () => {
        const uploader = makeUser();
        users.findOneBy.mockResolvedValueOnce(uploader);

        const result = await importAudio(fakeFile());

        expect(storageMock.upload).toHaveBeenCalledWith("sounds/1/theme.mp3", expect.any(Buffer), 1024, "audio/mpeg");
        expect(tracks.save.mock.calls[0]?.[0]).toMatchObject({
            storageKey: "sounds/1/theme.mp3",
            sizeInBytes: 1024,
            uploadedBy: uploader,
            isUserImported: true,
        });
        expect(result).toEqual({
            key: "sounds/1/theme.mp3",
            name: "Theme",
            type: SoundType.MUSIC,
            zone: Zone.FOREST,
            ambiance: Ambiance.CALM,
            isUserImported: true,
        });
    });

    it("stores a public sound under the shared folder without uploader and without quota check", async () => {
        const result = await importAudio(fakeFile({ mimetype: "AUDIO/OGG", filename: "rain.ogg" }), { type: SoundType.ENVIRONMENT, isUserImported: false });

        expect(result.key).toBe("sounds/0/rain.ogg");
        expect(tracks.findBy).not.toHaveBeenCalled();
        expect(users.findOneBy).not.toHaveBeenCalled();
        expect(tracks.save.mock.calls[0]?.[0].uploadedBy).toBeNull();
    });

    it("uses the shared folder when no user id is given", async () => {
        const result = await ImportAudioUseCase.getInstance().execute(undefined, fakeFile(), "Theme", SoundType.MUSIC, Zone.FOREST, Ambiance.CALM, false);

        expect(result.key).toBe("sounds/0/theme.mp3");
    });

    it("requires a file", async () => {
        await expect(importAudio(undefined)).rejects.toThrow("No file selected");
    });

    it("refuses a non audio file", async () => {
        await expect(importAudio(fakeFile({ mimetype: "image/png" }))).rejects.toThrow('File type "image/png" is not allowed');
    });

    it("refuses an unknown sound type", async () => {
        await expect(importAudio(fakeFile(), { type: "zone" as SoundType })).rejects.toThrow('Sound type "zone" is invalid');
    });

    it.each([undefined, "moon" as Zone])("requires a valid zone (%s)", async (zone) => {
        await expect(importAudio(fakeFile(), { zone: zone as Zone })).rejects.toThrow("A valid zone is required");
    });

    it.each([undefined, "boring" as Ambiance])("requires a valid ambiance (%s)", async (ambiance) => {
        await expect(importAudio(fakeFile(), { ambiance: ambiance as Ambiance })).rejects.toThrow("A valid ambiance is required");
    });

    it("refuses a file over 20 MB", async () => {
        await expect(importAudio(fakeFile({ size: 20 * MB + 1 }))).rejects.toThrow("Maximum file size is 20");
    });

    it("refuses an upload that exceeds the 300 MB user quota", async () => {
        tracks.findBy.mockResolvedValueOnce([makeTrack({ sizeInBytes: 290 * MB }), makeTrack({ sizeInBytes: 5 * MB })]);

        await expect(importAudio(fakeFile({ size: 6 * MB }))).rejects.toThrow("Maximum upload capacity of 300 is reached for this user");
        expect(storageMock.upload).not.toHaveBeenCalled();
    });

    it("refuses a file name already uploaded in the same folder", async () => {
        tracks.exists.mockResolvedValueOnce(true);

        await expect(importAudio(fakeFile())).rejects.toThrow("A file with this name has already been uploaded");
        expect(tracks.exists).toHaveBeenCalledWith({ where: { storageKey: "sounds/1/theme.mp3" } });
        expect(storageMock.upload).not.toHaveBeenCalled();
    });

    it("refuses a private upload from an unknown user without storing the file", async () => {
        await expect(importAudio(fakeFile())).rejects.toThrow("User does not exist");
        expect(storageMock.upload).not.toHaveBeenCalled();
        expect(tracks.save).not.toHaveBeenCalled();
    });
});

describe("ListAudioTracksUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(ListAudioTracksUseCase.getInstance()).toBe(ListAudioTracksUseCase.getInstance());
    });

    it("lists the public sounds and the user's own sounds with all filters", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 4 }));
        tracks.findAndCount.mockResolvedValueOnce([[makeTrack()], 1]);

        const result = await ListAudioTracksUseCase.getInstance().execute(4, SoundType.MUSIC, Zone.FOREST, Ambiance.CALM, true, 20, 10);

        const filters = { type: SoundType.MUSIC, isUserImported: true, zone: Zone.FOREST, ambiance: Ambiance.CALM };
        expect(tracks.findAndCount).toHaveBeenCalledWith({
            where: [
                { ...filters, uploadedBy: { id: 4 } },
                { ...filters, uploadedBy: IsNull() },
            ],
            skip: 20,
            take: 10,
        });
        expect(result).toEqual({
            data: [{ key: "sounds/0/forest.mp3", name: "Forest theme", type: "music", zone: "forest", ambiance: "calm", isUserImported: false }],
            total: 1,
        });
    });

    it("applies no filter and default pagination when none is given", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        const result = await ListAudioTracksUseCase.getInstance().execute(undefined, undefined, undefined, undefined, undefined);

        expect(tracks.findAndCount).toHaveBeenCalledWith({
            where: [{ uploadedBy: { id: 0 } }, { uploadedBy: IsNull() }],
            skip: 0,
            take: 20,
        });
        expect(result).toEqual({ data: [], total: 0 });
    });

    it("rejects an unknown user", async () => {
        await expect(ListAudioTracksUseCase.getInstance().execute(99, undefined, undefined, undefined, undefined))
            .rejects.toThrow("User does not exist");
    });
});

describe("DrawSessionSoundsUseCase", () => {
    const owner = makeUser();
    const draw = (...filters: [Zone | undefined, Ambiance | undefined] | []) => {
        const [zone, ambiance] = filters.length === 0 ? [Zone.FOREST, undefined] : filters;
        return DrawSessionSoundsUseCase.getInstance().execute(owner.id, 10, zone, ambiance);
    };

    const givenSession = (overrides = {}) => {
        const session = makeSession({ owner, ...overrides });
        users.findOneBy.mockResolvedValueOnce(owner);
        sessions.findOne.mockResolvedValueOnce(session);
        return session;
    };

    const givenTracks = (music: AudioTrack[], environment: AudioTrack[]) => {
        tracks.find.mockResolvedValueOnce(music).mockResolvedValueOnce(environment);
    };

    it("returns the same singleton instance", () => {
        expect(DrawSessionSoundsUseCase.getInstance()).toBe(DrawSessionSoundsUseCase.getInstance());
    });

    it("draws one music and one environment among public and host sounds", async () => {
        const session = givenSession();
        const music = makeTrack({ id: 1, storageKey: "sounds/0/m.mp3" });
        const environment = makeTrack({ id: 2, storageKey: "sounds/1/e.mp3", type: SoundType.ENVIRONMENT, isUserImported: true });
        givenTracks([music], [environment]);

        const result = await draw(Zone.FOREST, Ambiance.CALM);

        const filters = { zone: Zone.FOREST, ambiance: Ambiance.CALM };
        expect(tracks.find).toHaveBeenNthCalledWith(1, {
            where: [
                { type: SoundType.MUSIC, ...filters, uploadedBy: IsNull() },
                { type: SoundType.MUSIC, ...filters, uploadedBy: { id: owner.id } },
            ],
        });
        expect(tracks.find).toHaveBeenNthCalledWith(2, {
            where: [
                { type: SoundType.ENVIRONMENT, ...filters, uploadedBy: IsNull() },
                { type: SoundType.ENVIRONMENT, ...filters, uploadedBy: { id: owner.id } },
            ],
        });
        expect(result.music?.key).toBe("sounds/0/m.mp3");
        expect(result.environment?.key).toBe("sounds/1/e.mp3");
        expect(session.alreadyPlayedMusic).toEqual([1]);
        expect(session.alreadyPlayedEnvironment).toEqual([2]);
        expect(sessions.save).toHaveBeenCalledWith(session);
    });

    it("records the drawn sounds and filters as the current state of the session", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const session = givenSession();
        const music = makeTrack({ id: 1 });
        const environment = makeTrack({ id: 2, type: SoundType.ENVIRONMENT });
        givenTracks([music], [environment]);

        await draw(Zone.FOREST, Ambiance.CALM);

        expect(session.currentMusic).toBe(music);
        expect(session.currentEnvironment).toBe(environment);
        expect(session.currentZone).toBe(Zone.FOREST);
        expect(session.currentAmbiance).toBe(Ambiance.CALM);
        expect(session.playbackStartedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
        expect(session.playbackStatus).toBe(PlaybackStatus.PLAYING);
        expect(session.playbackPositionMs).toBe(0);
    });

    it("replaces the previous state, clearing the filter and the type that was not drawn", async () => {
        const session = givenSession({
            currentEnvironment: makeTrack({ id: 9, type: SoundType.ENVIRONMENT }),
            currentZone: Zone.FOREST,
        });
        givenTracks([makeTrack({ id: 1 })], []);

        await draw(undefined, Ambiance.COMBAT);

        expect(session.currentEnvironment).toBeNull();
        expect(session.currentZone).toBeNull();
        expect(session.currentAmbiance).toBe(Ambiance.COMBAT);
    });

    it("filters by ambiance only", async () => {
        givenSession();
        givenTracks([makeTrack()], []);

        await draw(undefined, Ambiance.COMBAT);

        expect(tracks.find.mock.calls[0]?.[0].where[0]).toEqual({ type: SoundType.MUSIC, ambiance: Ambiance.COMBAT, uploadedBy: IsNull() });
    });

    it("returns null for a type without matching sound and keeps its history", async () => {
        const session = givenSession({ alreadyPlayedEnvironment: [7] });
        givenTracks([makeTrack({ id: 1 })], []);

        const result = await draw();

        expect(result.environment).toBeNull();
        expect(session.alreadyPlayedEnvironment).toEqual([7]);
    });

    it("never draws a recently played sound while others are available", async () => {
        givenSession({ alreadyPlayedMusic: [1, 2] });
        givenTracks([makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3, storageKey: "sounds/0/three.mp3" })], []);

        const result = await draw();

        expect(result.music?.key).toBe("sounds/0/three.mp3");
    });

    it("resets the history once every sound has been played", async () => {
        const session = givenSession({ alreadyPlayedMusic: [1] });
        givenTracks([makeTrack({ id: 1 })], []);

        await draw();

        expect(session.alreadyPlayedMusic).toEqual([1]);
    });

    it("keeps only the five last played sounds", async () => {
        const session = givenSession({ alreadyPlayedMusic: [1, 2, 3, 4, 5] });
        givenTracks([makeTrack({ id: 6 }), makeTrack({ id: 1 })], []);
        vi.spyOn(Math, "random").mockReturnValueOnce(0);

        await draw();

        expect(session.alreadyPlayedMusic).toEqual([2, 3, 4, 5, 6]);
    });

    it("requires a zone or an ambiance", async () => {
        givenSession();

        await expect(draw(undefined, undefined)).rejects.toThrow("You need to select at least one zone or ambiance");
    });

    it("fails when no sound matches at all", async () => {
        givenSession();
        givenTracks([], []);

        await expect(draw()).rejects.toThrow("No such sounds");
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it("rejects an unknown user", async () => {
        await expect(draw()).rejects.toThrow("User does not exist");
    });

    it("rejects an unknown session", async () => {
        users.findOneBy.mockResolvedValueOnce(owner);

        await expect(draw()).rejects.toThrow("Session does not exist");
    });

    it("refuses a user who is not the session owner", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 2 }));
        sessions.findOne.mockResolvedValueOnce(makeSession({ owner }));

        await expect(DrawSessionSoundsUseCase.getInstance().execute(2, 10, Zone.FOREST, undefined))
            .rejects.toThrow("User is not the owner of the session");
    });

    it("fails safely if the random pick returns nothing", async () => {
        givenSession();
        givenTracks([makeTrack()], []);
        vi.spyOn(Math, "random").mockReturnValueOnce(1);

        await expect(draw()).rejects.toThrow("Error: No sound selected.");
    });
});

describe("DeleteAudioTrackUseCase", () => {
    const owner = makeUser();
    const ownTrack = (overrides = {}) => makeTrack({ storageKey: "sounds/1/mine.mp3", uploadedBy: owner, isUserImported: true, ...overrides });
    const remove = (key = "sounds/1/mine.mp3", userId = owner.id) => DeleteAudioTrackUseCase.getInstance().execute(userId, key);

    it("returns the same singleton instance", () => {
        expect(DeleteAudioTrackUseCase.getInstance()).toBe(DeleteAudioTrackUseCase.getInstance());
    });

    it("deletes the file and the row of a sound uploaded by the user", async () => {
        const track = ownTrack();
        tracks.findOne.mockResolvedValueOnce(track);

        const result = await remove();

        expect(tracks.findOne).toHaveBeenCalledWith({ where: { storageKey: "sounds/1/mine.mp3" }, relations: { uploadedBy: true } });
        expect(storageMock.delete).toHaveBeenCalledWith("sounds/1/mine.mp3");
        expect(tracks.remove).toHaveBeenCalledWith(track);
        expect(result).toEqual({ key: "sounds/1/mine.mp3", name: track.name, type: track.type, zone: track.zone, ambiance: track.ambiance, isUserImported: true });
    });

    it("refuses a sound that does not exist", async () => {
        await expect(remove("sounds/1/ghost.mp3")).rejects.toThrow("Sound does not exist");
        expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it("refuses a sound uploaded by someone else", async () => {
        tracks.findOne.mockResolvedValueOnce(ownTrack({ uploadedBy: makeUser({ id: 2 }) }));

        await expect(remove()).rejects.toThrow("You can only delete your own sounds");
        expect(storageMock.delete).not.toHaveBeenCalled();
        expect(tracks.remove).not.toHaveBeenCalled();
    });

    it("refuses a public sound", async () => {
        tracks.findOne.mockResolvedValueOnce(ownTrack({ uploadedBy: null, isUserImported: false, storageKey: "sounds/0/public.mp3" }));

        await expect(remove("sounds/0/public.mp3")).rejects.toThrow("You can only delete your own sounds");
        expect(tracks.remove).not.toHaveBeenCalled();
    });

    it("keeps the row when the file cannot be deleted from the storage", async () => {
        tracks.findOne.mockResolvedValueOnce(ownTrack());
        storageMock.delete.mockRejectedValueOnce(new Error("storage down"));

        await expect(remove()).rejects.toThrow("storage down");
        expect(tracks.remove).not.toHaveBeenCalled();
    });
});
