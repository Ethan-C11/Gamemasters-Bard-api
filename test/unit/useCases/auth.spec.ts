import { describe, expect, it, vi, afterEach } from "vitest";
import { IsNull } from "typeorm";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { sendMailMock } from "../../helpers/mockStorage.js";
import { makeUser } from "../../helpers/factories.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { RefreshToken } from "../../../src/infrastructure/db/entities/refreshToken.entity.js";
import { SignUpUseCase } from "../../../src/application/useCases/auth/SignUpUseCase.js";
import { SignInUseCase } from "../../../src/application/useCases/auth/SignInUseCase.js";
import { IssueRefreshTokenUseCase } from "../../../src/application/useCases/auth/IssueRefreshTokenUseCase.js";
import { RefreshAccessTokenUseCase } from "../../../src/application/useCases/auth/RefreshAccessTokenUseCase.js";
import { SendActivationEmailUseCase } from "../../../src/application/useCases/auth/SendActivationEmailUseCase.js";
import { PasswordHasher } from "../../../src/shared/utils/PasswordHasher.js";
import { TokenHasher } from "../../../src/shared/utils/TokenHasher.js";
import { Role } from "../../../src/shared/enums/Role.js";
import { UserStatus } from "../../../src/shared/enums/UserStatus.js";

const users = repositoryFor(User);
const refreshTokens = repositoryFor(RefreshToken);

afterEach(() => {
    vi.useRealTimers();
});

describe("SignUpUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SignUpUseCase.getInstance()).toBe(SignUpUseCase.getInstance());
    });

    it("creates an active user with a trimmed identity and a hashed password", async () => {
        const user = await SignUpUseCase.getInstance().execute(" gm@gm-test.test ", "  bard  ", "password123");

        expect(user.email).toBe("gm@gm-test.test");
        expect(user.username).toBe("bard");
        expect(user.role).toBe(Role.USER);
        expect(user.userStatus).toBe(UserStatus.ACTIVE);
        expect(user.hashedPassword).not.toBe("password123");
        await expect(PasswordHasher.verify(user.hashedPassword as string, "password123")).resolves.toBe(true);
        expect(users.save).toHaveBeenCalledOnce();
    });

    it("refuses an email that is already used", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        await expect(SignUpUseCase.getInstance().execute("gm@gm-test.test", "bard", "password123"))
            .rejects.toThrow("Email is already used");
        expect(users.save).not.toHaveBeenCalled();
    });
});

describe("SignInUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SignInUseCase.getInstance()).toBe(SignInUseCase.getInstance());
    });

    it("signs in an active user and records the connection date", async () => {
        const user = makeUser({ hashedPassword: await PasswordHasher.hash("password123"), lastConnection: null });
        users.findOneBy.mockResolvedValueOnce(user);

        const result = await SignInUseCase.getInstance().execute(user.email, "password123");

        expect(result).toBe(user);
        expect(result.lastConnection).toBeInstanceOf(Date);
        expect(users.save).toHaveBeenCalledWith(user);
    });

    it("rejects an unknown email", async () => {
        await expect(SignInUseCase.getInstance().execute("nobody@gm-test.test", "password123"))
            .rejects.toThrow("Invalid email or password");
    });

    it("rejects an account without password", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ hashedPassword: null }));

        await expect(SignInUseCase.getInstance().execute("gm@gm-test.test", "password123"))
            .rejects.toThrow("Invalid email or password");
    });

    it("rejects an account that is not active", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ userStatus: UserStatus.PENDING_ACTIVATION }));

        await expect(SignInUseCase.getInstance().execute("gm@gm-test.test", "password123"))
            .rejects.toThrow("Invalid email or password");
    });

    it("rejects a wrong password", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ hashedPassword: await PasswordHasher.hash("password123") }));

        await expect(SignInUseCase.getInstance().execute("gm@gm-test.test", "wrong-password"))
            .rejects.toThrow("Invalid email or password");
        expect(users.save).not.toHaveBeenCalled();
    });
});

describe("IssueRefreshTokenUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(IssueRefreshTokenUseCase.getInstance()).toBe(IssueRefreshTokenUseCase.getInstance());
    });

    it("stores only the hash of a 30 days token and returns the raw token", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        const rawToken = await IssueRefreshTokenUseCase.getInstance().execute(42);

        const stored = refreshTokens.save.mock.calls[0]?.[0];
        expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.userId).toBe(42);
        expect(stored.tokenHash).toBe(TokenHasher.hashToken(rawToken));
        expect(stored.revokedAt).toBeNull();
        expect(stored.expiresAt).toEqual(new Date("2026-01-31T00:00:00.000Z"));
    });
});

describe("RefreshAccessTokenUseCase", () => {
    const validToken = (overrides = {}) => ({
        id: "token-id",
        userId: 1,
        tokenHash: TokenHasher.hashToken("raw"),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        ...overrides,
    });

    it("returns the same singleton instance", () => {
        expect(RefreshAccessTokenUseCase.getInstance()).toBe(RefreshAccessTokenUseCase.getInstance());
    });

    it("revokes the used token and issues a new one", async () => {
        const stored = validToken();
        const user = makeUser();
        refreshTokens.findOne.mockResolvedValueOnce(stored);
        users.findOneBy.mockResolvedValueOnce(user);

        const result = await RefreshAccessTokenUseCase.getInstance().execute("raw");

        expect(refreshTokens.findOne).toHaveBeenCalledWith({
            where: { tokenHash: TokenHasher.hashToken("raw"), revokedAt: IsNull() },
        });
        expect(stored.revokedAt).toBeInstanceOf(Date);
        expect(result.user).toBe(user);
        expect(result.newRawRefreshToken).toMatch(/^[0-9a-f]{64}$/);
        expect(refreshTokens.save).toHaveBeenCalledTimes(2);
    });

    it("rejects an unknown or revoked token", async () => {
        await expect(RefreshAccessTokenUseCase.getInstance().execute("raw")).rejects.toThrow("Invalid refresh token");
    });

    it("rejects an expired token", async () => {
        refreshTokens.findOne.mockResolvedValueOnce(validToken({ expiresAt: new Date(Date.now() - 1000) }));

        await expect(RefreshAccessTokenUseCase.getInstance().execute("raw")).rejects.toThrow("Refresh token expired");
    });

    it("rejects a token whose user no longer exists", async () => {
        refreshTokens.findOne.mockResolvedValueOnce(validToken());

        await expect(RefreshAccessTokenUseCase.getInstance().execute("raw")).rejects.toThrow("User not found");
    });
});

describe("SendActivationEmailUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SendActivationEmailUseCase.getInstance()).toBe(SendActivationEmailUseCase.getInstance());
    });

    it("sends the activation link to the user", async () => {
        sendMailMock.mockResolvedValueOnce({ messageId: "msg-1" });

        const messageId = await SendActivationEmailUseCase.getInstance().execute("new@gm-test.test", "raw-token");

        const mail = sendMailMock.mock.calls[0]?.[0];
        expect(messageId).toBe("msg-1");
        expect(mail.to).toBe("new@gm-test.test");
        expect(mail.from).toBe(process.env.EMAIL_FROM);
        expect(mail.text).toContain("http://frontend.test/activate?token=raw-token");
        expect(mail.html).toContain("http://frontend.test/activate?token=raw-token");
    });

    it("propagates mailer errors", async () => {
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(SendActivationEmailUseCase.getInstance().execute("new@gm-test.test", "raw-token"))
            .rejects.toThrow("SMTP down");
    });
});
