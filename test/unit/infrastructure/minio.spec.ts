import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const client = vi.hoisted(() => ({
    bucketExists: vi.fn(),
    makeBucket: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    presignedGetObject: vi.fn(),
    removeObject: vi.fn(),
    listObjectsV2: vi.fn(),
}));
const clientConstructor = vi.hoisted(() => vi.fn());

vi.mock("minio", () => ({
    Client: class {
        constructor(options: unknown) {
            clientConstructor(options);
            return client;
        }
    },
}));

type StorageModule = typeof import("../../../src/infrastructure/storage/MinioStorageService.js");
const { MinioStorageService } = await vi.importActual<StorageModule>("../../../src/infrastructure/storage/MinioStorageService.js");

describe("MinioStorageService", () => {
    const storage = MinioStorageService.getInstance();

    beforeEach(() => {
        client.listObjectsV2.mockReset();
    });

    it("is a singleton that builds its client only once", () => {
        expect(MinioStorageService.getInstance()).toBe(storage);
        expect(clientConstructor).not.toHaveBeenCalled();
    });

    it("creates the bucket only when it does not exist", async () => {
        client.bucketExists.mockResolvedValueOnce(false);
        await storage.ensureBucketExists();
        expect(client.makeBucket).toHaveBeenCalledWith("audio-test", "us-east-1");

        client.makeBucket.mockClear();
        client.bucketExists.mockResolvedValueOnce(true);
        await storage.ensureBucketExists();
        expect(client.makeBucket).not.toHaveBeenCalled();
    });

    it("pings the bucket and fails when it does not exist", async () => {
        client.bucketExists.mockResolvedValueOnce(true);
        await expect(storage.ping()).resolves.toBeUndefined();

        client.bucketExists.mockResolvedValueOnce(false);
        await expect(storage.ping()).rejects.toThrow("Bucket does not exist");

        client.bucketExists.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
        await expect(storage.ping()).rejects.toThrow("connect ECONNREFUSED");
    });

    it("uploads with the content type", async () => {
        const body = Buffer.from("data");

        await storage.upload("sounds/1/a.mp3", body, 4, "audio/mpeg");

        expect(client.putObject).toHaveBeenCalledWith("audio-test", "sounds/1/a.mp3", body, 4, { "Content-Type": "audio/mpeg" });
    });

    it("downloads, signs and deletes objects", async () => {
        const stream = Readable.from(["x"]);
        client.getObject.mockResolvedValueOnce(stream);
        client.presignedGetObject.mockResolvedValueOnce("http://signed");

        await expect(storage.download("k")).resolves.toBe(stream);
        await expect(storage.getSignedUrl("k")).resolves.toBe("http://signed");
        expect(client.presignedGetObject).toHaveBeenCalledWith("audio-test", "k", 3600);
        await storage.getSignedUrl("k", 60);
        expect(client.presignedGetObject).toHaveBeenLastCalledWith("audio-test", "k", 60);
        await storage.delete("k");
        expect(client.removeObject).toHaveBeenCalledWith("audio-test", "k");
    });

    it("lists the keys under a prefix", async () => {
        const stream = new EventEmitter();
        client.listObjectsV2.mockReturnValueOnce(stream);

        const promise = storage.listByPrefix("sounds/1/");
        stream.emit("data", { name: "sounds/1/a.mp3" });
        stream.emit("data", { prefix: "sounds/1/sub/" });
        stream.emit("data", { name: "sounds/1/b.mp3" });
        stream.emit("end");

        await expect(promise).resolves.toEqual(["sounds/1/a.mp3", "sounds/1/b.mp3"]);
        expect(client.listObjectsV2).toHaveBeenCalledWith("audio-test", "sounds/1/", true);
    });

    it("rejects when listing fails", async () => {
        const stream = new EventEmitter();
        client.listObjectsV2.mockReturnValueOnce(stream);

        const promise = storage.listByPrefix("sounds/");
        stream.emit("error", new Error("boom"));

        await expect(promise).rejects.toThrow("boom");
    });
});

describe("MinioStorageService endpoint parsing", () => {
    it.each([
        ["https://s3.example.test", { endPoint: "s3.example.test", port: 443, useSSL: true }],
        ["http://s3.example.test", { endPoint: "s3.example.test", port: 80, useSSL: false }],
        ["http://127.0.0.1:9000", { endPoint: "127.0.0.1", port: 9000, useSSL: false }],
    ])("parses %s", async (endpoint, expected) => {
        vi.resetModules();
        clientConstructor.mockClear();
        process.env.S3_ENDPOINT = endpoint;

        const module = await vi.importActual<StorageModule>("../../../src/infrastructure/storage/MinioStorageService.js");
        module.MinioStorageService.getInstance();

        expect(clientConstructor).toHaveBeenCalledWith(expect.objectContaining(expected));
        process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    });
});
