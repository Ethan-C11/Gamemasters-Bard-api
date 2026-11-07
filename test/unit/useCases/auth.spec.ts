import { describe, expect, it, vi, afterEach } from "vitest";
import { IsNull } from "typeorm";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { sendMailMock } from "../../helpers/mockStorage.js";
import { makeUser } from "../../helpers/factories.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { RefreshToken } from "../../../src/infrastructure/db/entities/refreshToken.entity.js";
import { ActivationToken } from "../../../src/infrastructure/db/entities/activationToken.entity.js";
import { SignUpUseCase } from "../../../src/application/useCases/auth/SignUpUseCase.js";
import { SignInUseCase } from "../../../src/application/useCases/auth/SignInUseCase.js";
import { IssueRefreshTokenUseCase } from "../../../src/application/useCases/auth/IssueRefreshTokenUseCase.js";
import { RefreshAccessTokenUseCase } from "../../../src/application/useCases/auth/RefreshAccessTokenUseCase.js";
import { SendActivationEmailUseCase } from "../../../src/application/useCases/auth/SendActivationEmailUseCase.js";
import { SendPasswordResetEmailUseCase } from "../../../src/application/useCases/auth/SendPasswordResetEmailUseCase.js";
import { RequestPasswordResetUseCase } from "../../../src/application/useCases/auth/RequestPasswordResetUseCase.js";
import { ResetPasswordUseCase } from "../../../src/application/useCases/auth/ResetPasswordUseCase.js";
import { RequestEmailVerificationUseCase } from "../../../src/application/useCases/auth/RequestEmailVerificationUseCase.js";
import { ResendVerificationEmailUseCase } from "../../../src/application/useCases/auth/ResendVerificationEmailUseCase.js";
import { VerifyEmailUseCase } from "../../../src/application/useCases/auth/VerifyEmailUseCase.js";
import { LogoutUseCase } from "../../../src/application/useCases/auth/LogoutUseCase.js";
import { PasswordHasher } from "../../../src/shared/utils/PasswordHasher.js";
import { TokenHasher } from "../../../src/shared/utils/TokenHasher.js";
import { Role } from "../../../src/shared/enums/Role.js";
import { UserStatus } from "../../../src/shared/enums/UserStatus.js";
import { TokenPurpose } from "../../../src/shared/enums/TokenPurpose.js";

const users = repositoryFor(User);
const refreshTokens = repositoryFor(RefreshToken);
const activationTokens = repositoryFor(ActivationToken);

afterEach(() => {
    vi.useRealTimers();
});

describe("SignUpUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SignUpUseCase.getInstance()).toBe(SignUpUseCase.getInstance());
    });

    it("creates a pending user with a trimmed identity and a hashed password", async () => {
        const user = await SignUpUseCase.getInstance().execute(" gm@gm-test.test ", "  bard  ", "password123");

        expect(user.email).toBe("gm@gm-test.test");
        expect(user.username).toBe("bard");
        expect(user.role).toBe(Role.USER);
        expect(user.userStatus).toBe(UserStatus.PENDING_ACTIVATION);
        expect(user.hashedPassword).not.toBe("password123");
        await expect(PasswordHasher.verify(user.hashedPassword as string, "password123")).resolves.toBe(true);
        expect(users.save).toHaveBeenCalledOnce();
        expect(sendMailMock).toHaveBeenCalledOnce();
        expect(sendMailMock.mock.calls[0]?.[0].to).toBe("gm@gm-test.test");
    });

    it("removes the account when the verification email cannot be sent", async () => {
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(SignUpUseCase.getInstance().execute("gm@gm-test.test", "bard", "password123"))
            .rejects.toThrow("SMTP down");
        expect(users.remove).toHaveBeenCalledOnce();
    });

    it("refuses an email that is already used", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        await expect(SignUpUseCase.getInstance().execute("gm@gm-test.test", "bard", "password123"))
            .rejects.toThrow("Email is already used");
        expect(users.save).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
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

describe("SendPasswordResetEmailUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SendPasswordResetEmailUseCase.getInstance()).toBe(SendPasswordResetEmailUseCase.getInstance());
    });

    it("sends the reset link to the user", async () => {
        sendMailMock.mockResolvedValueOnce({ messageId: "msg-2" });

        const messageId = await SendPasswordResetEmailUseCase.getInstance().execute("gm@gm-test.test", "raw-token");

        const mail = sendMailMock.mock.calls[0]?.[0];
        expect(messageId).toBe("msg-2");
        expect(mail.to).toBe("gm@gm-test.test");
        expect(mail.from).toBe(process.env.EMAIL_FROM);
        expect(mail.subject).toContain("Reset your password");
        expect(mail.text).toContain("http://frontend.test/reset-password?token=raw-token");
        expect(mail.html).toContain("http://frontend.test/reset-password?token=raw-token");
    });

    it("propagates mailer errors", async () => {
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(SendPasswordResetEmailUseCase.getInstance().execute("gm@gm-test.test", "raw-token"))
            .rejects.toThrow("SMTP down");
    });
});

describe("RequestPasswordResetUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(RequestPasswordResetUseCase.getInstance()).toBe(RequestPasswordResetUseCase.getInstance());
    });

    it("stores the hash of a 1 hour token, cancels older links and emails the raw token", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 4, email: "gm@gm-test.test" }));

        await RequestPasswordResetUseCase.getInstance().execute("gm@gm-test.test");

        expect(users.findOneBy).toHaveBeenCalledWith({ email: "gm@gm-test.test" });
        expect(activationTokens.update).toHaveBeenCalledWith(
            { userId: 4, purpose: TokenPurpose.PASSWORD_RESET, usedAt: IsNull() },
            { usedAt: new Date("2026-01-01T00:00:00.000Z") },
        );
        const mail = sendMailMock.mock.calls[0]?.[0];
        const rawToken = new URL(mail.text.match(/http\S+/)[0]).searchParams.get("token") as string;
        const stored = activationTokens.save.mock.calls[0]?.[0];
        expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
        expect(mail.to).toBe("gm@gm-test.test");
        expect(stored.userId).toBe(4);
        expect(stored.purpose).toBe(TokenPurpose.PASSWORD_RESET);
        expect(stored.tokenHash).toBe(TokenHasher.hashToken(rawToken));
        expect(stored.tokenHash).not.toBe(rawToken);
        expect(stored.expiresAt).toEqual(new Date("2026-01-01T01:00:00.000Z"));
    });

    it("does nothing for an unknown email", async () => {
        await RequestPasswordResetUseCase.getInstance().execute("nobody@gm-test.test");

        expect(activationTokens.update).not.toHaveBeenCalled();
        expect(activationTokens.save).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("does nothing for an account without password", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ hashedPassword: null }));

        await RequestPasswordResetUseCase.getInstance().execute("gm@gm-test.test");

        expect(activationTokens.save).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("does nothing for an account that is not active", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ userStatus: UserStatus.PENDING_ACTIVATION }));

        await RequestPasswordResetUseCase.getInstance().execute("gm@gm-test.test");

        expect(activationTokens.save).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("propagates mailer errors", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(RequestPasswordResetUseCase.getInstance().execute("gm@gm-test.test"))
            .rejects.toThrow("SMTP down");
    });
});

describe("ResetPasswordUseCase", () => {
    const tokenRow = (overrides = {}) => ({
        id: "1",
        userId: 5,
        tokenHash: TokenHasher.hashToken("raw"),
        purpose: TokenPurpose.PASSWORD_RESET,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    });

    it("returns the same singleton instance", () => {
        expect(ResetPasswordUseCase.getInstance()).toBe(ResetPasswordUseCase.getInstance());
    });

    it("sets the new password, consumes the token and revokes the refresh tokens", async () => {
        const row = tokenRow();
        const user = makeUser({ id: 5, hashedPassword: "old-hash" });
        activationTokens.findOneBy.mockResolvedValueOnce(row);
        users.findOneBy.mockResolvedValueOnce(user);

        const result = await ResetPasswordUseCase.getInstance().execute("raw", "newpass1");

        expect(activationTokens.findOneBy).toHaveBeenCalledWith({ tokenHash: TokenHasher.hashToken("raw"), purpose: TokenPurpose.PASSWORD_RESET });
        expect(result).toBe(user);
        await expect(PasswordHasher.verify(result.hashedPassword as string, "newpass1")).resolves.toBe(true);
        expect(users.save).toHaveBeenCalledWith(user);
        expect(row.usedAt).toBeInstanceOf(Date);
        expect(activationTokens.save).toHaveBeenCalledWith(row);
        expect(refreshTokens.update).toHaveBeenCalledWith(
            { userId: 5, revokedAt: IsNull() },
            { revokedAt: expect.any(Date) },
        );
    });

    it("rejects an unknown token or a token of another purpose", async () => {
        await expect(ResetPasswordUseCase.getInstance().execute("raw", "newpass1")).rejects.toThrow("Invalid token");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("rejects an already used token", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow({ usedAt: new Date() }));

        await expect(ResetPasswordUseCase.getInstance().execute("raw", "newpass1")).rejects.toThrow("Already used token");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("rejects an expired token", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));

        await expect(ResetPasswordUseCase.getInstance().execute("raw", "newpass1")).rejects.toThrow("Token is expired");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("rejects a token whose user no longer exists", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow());

        await expect(ResetPasswordUseCase.getInstance().execute("raw", "newpass1")).rejects.toThrow("User not found");
    });

    it("requires 12 characters for elevated accounts and keeps the token usable", async () => {
        const row = tokenRow();
        activationTokens.findOneBy.mockResolvedValueOnce(row);
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 5, role: Role.ADMIN }));

        await expect(ResetPasswordUseCase.getInstance().execute("raw", "short-pass1")).rejects.toThrow("Password must be at least 12 characters");
        expect(users.save).not.toHaveBeenCalled();
        expect(row.usedAt).toBeNull();
        expect(refreshTokens.update).not.toHaveBeenCalled();
    });

    it("accepts 12 characters for elevated accounts", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow());
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 5, role: Role.SOUND_CREATOR }));

        const result = await ResetPasswordUseCase.getInstance().execute("raw", "twelve-chars");

        await expect(PasswordHasher.verify(result.hashedPassword as string, "twelve-chars")).resolves.toBe(true);
    });
});

describe("LogoutUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(LogoutUseCase.getInstance()).toBe(LogoutUseCase.getInstance());
    });

    it("revokes only the given refresh token if it is not already revoked", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        await LogoutUseCase.getInstance().execute("raw");

        expect(refreshTokens.update).toHaveBeenCalledOnce();
        expect(refreshTokens.update).toHaveBeenCalledWith(
            { tokenHash: TokenHasher.hashToken("raw"), revokedAt: IsNull() },
            { revokedAt: new Date("2026-01-01T00:00:00.000Z") },
        );
    });

    it("does not fail when the token is unknown or already revoked", async () => {
        refreshTokens.update.mockResolvedValueOnce({ affected: 0 });

        await expect(LogoutUseCase.getInstance().execute("raw")).resolves.toBeUndefined();
    });

    it("propagates database errors", async () => {
        refreshTokens.update.mockRejectedValueOnce(new Error("DB down"));

        await expect(LogoutUseCase.getInstance().execute("raw")).rejects.toThrow("DB down");
    });
});

describe("RequestEmailVerificationUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(RequestEmailVerificationUseCase.getInstance()).toBe(RequestEmailVerificationUseCase.getInstance());
    });

    it("stores the hash of a 48 hour token, cancels older links and emails the raw token", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

        await RequestEmailVerificationUseCase.getInstance().execute(makeUser({ id: 4, email: "gm@gm-test.test" }));

        expect(activationTokens.update).toHaveBeenCalledWith(
            { userId: 4, purpose: TokenPurpose.EMAIL_VERIFICATION, usedAt: IsNull() },
            { usedAt: new Date("2026-01-01T00:00:00.000Z") },
        );
        const mail = sendMailMock.mock.calls[0]?.[0];
        const rawToken = new URL(mail.text.match(/http\S+/)[0]).searchParams.get("token") as string;
        const stored = activationTokens.save.mock.calls[0]?.[0];
        expect(mail.to).toBe("gm@gm-test.test");
        expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.userId).toBe(4);
        expect(stored.purpose).toBe(TokenPurpose.EMAIL_VERIFICATION);
        expect(stored.tokenHash).toBe(TokenHasher.hashToken(rawToken));
        expect(stored.tokenHash).not.toBe(rawToken);
        expect(stored.expiresAt).toEqual(new Date("2026-01-03T00:00:00.000Z"));
    });

    it("propagates mailer errors", async () => {
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(RequestEmailVerificationUseCase.getInstance().execute(makeUser()))
            .rejects.toThrow("SMTP down");
    });
});

describe("ResendVerificationEmailUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(ResendVerificationEmailUseCase.getInstance()).toBe(ResendVerificationEmailUseCase.getInstance());
    });

    it("sends a new link to a pending account", async () => {
        const execute = vi.spyOn(RequestEmailVerificationUseCase.getInstance(), "execute").mockResolvedValueOnce(undefined);
        const user = makeUser({ userStatus: UserStatus.PENDING_ACTIVATION });
        users.findOneBy.mockResolvedValueOnce(user);

        await ResendVerificationEmailUseCase.getInstance().execute("gm@gm-test.test");

        expect(users.findOneBy).toHaveBeenCalledWith({ email: "gm@gm-test.test" });
        expect(execute).toHaveBeenCalledWith(user);
    });

    it("does nothing for an unknown email", async () => {
        const execute = vi.spyOn(RequestEmailVerificationUseCase.getInstance(), "execute");

        await ResendVerificationEmailUseCase.getInstance().execute("nobody@gm-test.test");

        expect(execute).not.toHaveBeenCalled();
    });

    it("does nothing for an account that is already active", async () => {
        const execute = vi.spyOn(RequestEmailVerificationUseCase.getInstance(), "execute");
        users.findOneBy.mockResolvedValueOnce(makeUser({ userStatus: UserStatus.ACTIVE }));

        await ResendVerificationEmailUseCase.getInstance().execute("gm@gm-test.test");

        expect(execute).not.toHaveBeenCalled();
    });

    it("does nothing for an account without password", async () => {
        const execute = vi.spyOn(RequestEmailVerificationUseCase.getInstance(), "execute");
        users.findOneBy.mockResolvedValueOnce(makeUser({ hashedPassword: null, userStatus: UserStatus.PENDING_ACTIVATION }));

        await ResendVerificationEmailUseCase.getInstance().execute("gm@gm-test.test");

        expect(execute).not.toHaveBeenCalled();
    });
});

describe("VerifyEmailUseCase", () => {
    const tokenRow = (overrides = {}) => ({
        id: "1",
        userId: 5,
        tokenHash: TokenHasher.hashToken("raw"),
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    });

    it("returns the same singleton instance", () => {
        expect(VerifyEmailUseCase.getInstance()).toBe(VerifyEmailUseCase.getInstance());
    });

    it("activates the account and consumes the token", async () => {
        const row = tokenRow();
        const user = makeUser({ id: 5, userStatus: UserStatus.PENDING_ACTIVATION });
        activationTokens.findOneBy.mockResolvedValueOnce(row);
        users.findOneBy.mockResolvedValueOnce(user);

        const result = await VerifyEmailUseCase.getInstance().execute("raw");

        expect(activationTokens.findOneBy).toHaveBeenCalledWith({ tokenHash: TokenHasher.hashToken("raw"), purpose: TokenPurpose.EMAIL_VERIFICATION });
        expect(result.userStatus).toBe(UserStatus.ACTIVE);
        expect(users.save).toHaveBeenCalledWith(user);
        expect(row.usedAt).toBeInstanceOf(Date);
        expect(activationTokens.save).toHaveBeenCalledWith(row);
    });

    it("rejects an unknown token or a token of another purpose", async () => {
        await expect(VerifyEmailUseCase.getInstance().execute("raw")).rejects.toThrow("Invalid token");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("rejects an already used token", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow({ usedAt: new Date() }));

        await expect(VerifyEmailUseCase.getInstance().execute("raw")).rejects.toThrow("Already used token");
    });

    it("rejects an expired token", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));

        await expect(VerifyEmailUseCase.getInstance().execute("raw")).rejects.toThrow("Token is expired");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("rejects a token whose user no longer exists", async () => {
        activationTokens.findOneBy.mockResolvedValueOnce(tokenRow());

        await expect(VerifyEmailUseCase.getInstance().execute("raw")).rejects.toThrow("User not found");
    });
});
