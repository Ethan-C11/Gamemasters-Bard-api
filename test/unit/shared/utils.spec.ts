import { describe, expect, it, vi, afterEach } from "vitest";
import { generateRandomString } from "../../../src/shared/utils/GenerateRandomString.js";
import { MonthsAgo } from "../../../src/shared/utils/MonthsAgo.js";
import { PasswordHasher } from "../../../src/shared/utils/PasswordHasher.js";
import { TokenHasher } from "../../../src/shared/utils/TokenHasher.js";

describe("generateRandomString", () => {
    it("returns a string of the requested length", () => {
        expect(generateRandomString(6)).toHaveLength(6);
        expect(generateRandomString(0)).toBe("");
    });

    it("only uses alphanumeric characters", () => {
        expect(generateRandomString(200)).toMatch(/^[A-Za-z0-9]+$/);
    });
});

describe("MonthsAgo", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns the date shifted back by the given number of months", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 15, 12));

        const date = MonthsAgo.monthsAgo(3);

        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(2);
        expect(date.getDate()).toBe(15);
    });

    it("crosses year boundaries", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10, 12));

        const date = MonthsAgo.monthsAgo(24);

        expect(date.getFullYear()).toBe(2024);
        expect(date.getMonth()).toBe(0);
    });
});

describe("PasswordHasher", () => {
    it("hashes with argon2id and verifies the right password", async () => {
        const hash = await PasswordHasher.hash("correct horse battery");

        expect(hash.startsWith("$argon2id$")).toBe(true);
        await expect(PasswordHasher.verify(hash, "correct horse battery")).resolves.toBe(true);
    });

    it("rejects a wrong password", async () => {
        const hash = await PasswordHasher.hash("correct horse battery");

        await expect(PasswordHasher.verify(hash, "wrong password")).resolves.toBe(false);
    });

    it("returns false instead of throwing on a malformed hash", async () => {
        await expect(PasswordHasher.verify("not-a-hash", "anything")).resolves.toBe(false);
    });
});

describe("TokenHasher", () => {
    it("generates 64 hex characters tokens that differ each time", () => {
        const first = TokenHasher.generate();
        const second = TokenHasher.generate();

        expect(first).toMatch(/^[0-9a-f]{64}$/);
        expect(first).not.toBe(second);
    });

    it("hashes deterministically with HMAC-SHA256", () => {
        const hash = TokenHasher.hashToken("raw-token");

        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(TokenHasher.hashToken("raw-token")).toBe(hash);
        expect(TokenHasher.hashToken("other-token")).not.toBe(hash);
    });
});
