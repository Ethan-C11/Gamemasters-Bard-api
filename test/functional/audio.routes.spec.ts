import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { bearer, createTestApp, tokenFor } from "../helpers/app.js";
import type { App } from "../../src/app.js";
import ImportAudioUseCase from "../../src/application/useCases/audio/ImportAudioUseCase.js";
import ListAudioTracksUseCase from "../../src/application/useCases/audio/ListAudioTracksUseCase.js";
import DeleteAudioTrackUseCase from "../../src/application/useCases/audio/DeleteAudioTrackUseCase.js";
import DrawSessionSoundsUseCase from "../../src/application/useCases/audio/DrawSessionSoundsUseCase.js";
import { Role } from "../../src/shared/enums/Role.js";

let app: App;
let token: string;

const track = { key: "sounds/1/theme.mp3", name: "Theme", type: "music", zone: "forest", ambiance: "calm", isUserImported: true };

beforeAll(async () => {
    app = await createTestApp();
    token = tokenFor(app, Role.USER, 1);
});

afterAll(async () => {
    await app.close();
});

function uploadForm(fields: Record<string, string>, withFile = true): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (withFile) form.append("file", new Blob([Buffer.alloc(256)], { type: "audio/mpeg" }), "theme.mp3");
    return form;
}

describe("POST /audio/upload", () => {
    it("parses the multipart form and forwards it to the use case", async () => {
        const spy = vi.spyOn(ImportAudioUseCase.getInstance(), "execute").mockResolvedValueOnce(track as never);

        const res = await app.inject({
            method: "POST",
            url: "/audio/upload",
            headers: bearer(token),
            body: uploadForm({ name: "Theme", type: "music", zone: "forest", ambiance: "calm", isUserImported: "true" }),
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(track);
        const [userId, file, name, type, zone, ambiance, isUserImported] = spy.mock.calls[0] ?? [];
        expect([userId, name, type, zone, ambiance, isUserImported]).toEqual([1, "Theme", "music", "forest", "calm", true]);
        expect(file?.filename).toBe("theme.mp3");
        expect(file?.mimetype).toBe("audio/mpeg");
    });

    it("defaults missing optional fields", async () => {
        const spy = vi.spyOn(ImportAudioUseCase.getInstance(), "execute").mockResolvedValueOnce(track as never);

        await app.inject({ method: "POST", url: "/audio/upload", headers: bearer(token), body: uploadForm({ type: "music", zone: "", ambiance: "" }) });

        const [, , name, , zone, ambiance, isUserImported] = spy.mock.calls[0] ?? [];
        expect([name, zone, ambiance, isUserImported]).toEqual(["", undefined, undefined, false]);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(ImportAudioUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("No file selected"));

        const res = await app.inject({ method: "POST", url: "/audio/upload", headers: bearer(token), body: uploadForm({ type: "music" }, false) });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "No file selected" });
    });

    it("requires authentication", async () => {
        const res = await app.inject({ method: "POST", url: "/audio/upload", body: uploadForm({ type: "music" }) });

        expect(res.statusCode).toBe(401);
    });
});

describe("POST /audio/resolve", () => {
    it("draws the sounds of a session", async () => {
        const spy = vi.spyOn(DrawSessionSoundsUseCase.getInstance(), "execute").mockResolvedValueOnce({ music: track, environment: null });

        const res = await app.inject({ method: "POST", url: "/audio/resolve", headers: bearer(token), payload: { sessionId: 10, zone: "forest" } });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ music: track, environment: null });
        expect(spy).toHaveBeenCalledWith(1, 10, "forest", undefined);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(DrawSessionSoundsUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("No such sounds"));

        const res = await app.inject({ method: "POST", url: "/audio/resolve", headers: bearer(token), payload: { sessionId: 10, ambiance: "calm" } });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "No such sounds" });
    });

    it.each([
        ["an unknown zone", { sessionId: 10, zone: "moon" }],
        ["an unknown ambiance", { sessionId: 10, ambiance: "boring" }],
        ["a missing session id", { zone: "forest" }],
    ])("rejects %s", async (_label, payload) => {
        const spy = vi.spyOn(DrawSessionSoundsUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "POST", url: "/audio/resolve", headers: bearer(token), payload });

        expect(res.statusCode).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("POST /audio/list", () => {
    it("lists the sounds with filters and pagination", async () => {
        const spy = vi.spyOn(ListAudioTracksUseCase.getInstance(), "execute").mockResolvedValueOnce({ data: [track], total: 1 });

        const res = await app.inject({
            method: "POST",
            url: "/audio/list",
            headers: bearer(token),
            payload: { type: "music", zone: "forest", ambiance: "calm", isUserImported: true, offset: 5, limit: 10 },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ data: [track], total: 1 });
        expect(spy).toHaveBeenCalledWith(1, "music", "forest", "calm", true, 5, 10);
    });

    it("uses the default pagination", async () => {
        const spy = vi.spyOn(ListAudioTracksUseCase.getInstance(), "execute").mockResolvedValueOnce({ data: [], total: 0 });

        await app.inject({ method: "POST", url: "/audio/list", headers: bearer(token), payload: {} });

        expect(spy).toHaveBeenCalledWith(1, undefined, undefined, undefined, undefined, 0, 20);
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(ListAudioTracksUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("User does not exist"));

        const res = await app.inject({ method: "POST", url: "/audio/list", headers: bearer(token), payload: {} });

        expect(res.statusCode).toBe(400);
    });

    it("rejects an unknown sound type", async () => {
        const res = await app.inject({ method: "POST", url: "/audio/list", headers: bearer(token), payload: { type: "zone" } });

        expect(res.statusCode).toBe(400);
    });
});

describe("DELETE /audio", () => {
    it("deletes the sound identified by its key", async () => {
        const spy = vi.spyOn(DeleteAudioTrackUseCase.getInstance(), "execute").mockResolvedValueOnce(track);

        const res = await app.inject({ method: "DELETE", url: "/audio?key=sounds/1/mine.mp3", headers: bearer(token) });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(track);
        expect(spy).toHaveBeenCalledWith(1, "sounds/1/mine.mp3");
    });

    it("answers 400 with the use case error", async () => {
        vi.spyOn(DeleteAudioTrackUseCase.getInstance(), "execute").mockRejectedValueOnce(new Error("You can only delete your own sounds"));

        const res = await app.inject({ method: "DELETE", url: "/audio?key=sounds/2/other.mp3", headers: bearer(token) });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: "You can only delete your own sounds" });
    });

    it("requires a key", async () => {
        const spy = vi.spyOn(DeleteAudioTrackUseCase.getInstance(), "execute");

        const res = await app.inject({ method: "DELETE", url: "/audio", headers: bearer(token) });

        expect(res.statusCode).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });

    it("requires authentication", async () => {
        const res = await app.inject({ method: "DELETE", url: "/audio?key=sounds/1/mine.mp3" });

        expect(res.statusCode).toBe(401);
    });
});
