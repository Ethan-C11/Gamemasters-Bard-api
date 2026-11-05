import { describe, expect, it } from "vitest";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { sendMailMock, storageMock } from "../../helpers/mockStorage.js";
import { makeTrack, makeUser } from "../../helpers/factories.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { AudioTrack } from "../../../src/infrastructure/db/entities/audioTrack.entity.js";
import { ActivationToken } from "../../../src/infrastructure/db/entities/activationToken.entity.js";
import { EditUserUseCase } from "../../../src/application/useCases/user/EditUserUseCase.js";
import { DeleteUserUseCase } from "../../../src/application/useCases/user/DeleteUserUseCase.js";
import { AccountActivationUseCase } from "../../../src/application/useCases/user/AccountActivationUseCase.js";
import { CreateUserWithRoleUseCase } from "../../../src/application/useCases/user/CreateUserWithRoleUseCase.js";
import { PasswordHasher } from "../../../src/shared/utils/PasswordHasher.js";
import { TokenHasher } from "../../../src/shared/utils/TokenHasher.js";
import { Role } from "../../../src/shared/enums/Role.js";
import { UserStatus } from "../../../src/shared/enums/UserStatus.js";
import { TokenPurpose } from "../../../src/shared/enums/TokenPurpose.js";

const users = repositoryFor(User);
const tracks = repositoryFor(AudioTrack);
const tokens = repositoryFor(ActivationToken);

describe("EditUserUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(EditUserUseCase.getInstance()).toBe(EditUserUseCase.getInstance());
    });

    it("updates only the provided fields and hashes the new password", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        const edited = await EditUserUseCase.getInstance().execute(1, "newName", "new@gm-test.test", "newPassword1");

        expect(edited.username).toBe("newName");
        expect(edited.email).toBe("new@gm-test.test");
        await expect(PasswordHasher.verify(edited.hashedPassword as string, "newPassword1")).resolves.toBe(true);
    });

    it("keeps current values when nothing is provided", async () => {
        const user = makeUser();
        users.findOneBy.mockResolvedValueOnce(user);

        const edited = await EditUserUseCase.getInstance().execute(1);

        expect(edited).toMatchObject({ username: user.username, email: user.email, hashedPassword: user.hashedPassword });
    });

    it("rejects an unknown user", async () => {
        await expect(EditUserUseCase.getInstance().execute(99, "x")).rejects.toThrow("User not found");
    });
});

describe("DeleteUserUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(DeleteUserUseCase.getInstance()).toBe(DeleteUserUseCase.getInstance());
    });

    it("deletes the user's imported sounds, their folder and the account", async () => {
        const user = makeUser({ id: 7 });
        users.findOneBy.mockResolvedValueOnce(user);
        users.remove.mockResolvedValueOnce({ ...user, id: undefined });
        tracks.findBy.mockResolvedValueOnce([
            makeTrack({ id: 1, storageKey: "sounds/7/a.mp3" }),
            makeTrack({ id: 2, storageKey: "sounds/7/b.mp3" }),
        ]);

        const removed = await DeleteUserUseCase.getInstance().execute(7);

        expect(tracks.findBy).toHaveBeenCalledWith({ uploadedBy: { id: 7 }, isUserImported: true });
        expect(storageMock.delete.mock.calls.map((call) => call[0])).toEqual([
            "sounds/7/a.mp3",
            "sounds/7/b.mp3",
            "sounds/7",
        ]);
        expect(tracks.remove).toHaveBeenCalledTimes(2);
        expect(users.remove).toHaveBeenCalledWith(user);
        expect(removed.id).toBe(7);
    });

    it("deletes an account without sounds", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 7 }));
        users.remove.mockImplementationOnce(async (entity: User) => entity);

        await DeleteUserUseCase.getInstance().execute(7);

        expect(storageMock.delete).not.toHaveBeenCalled();
        expect(users.remove).toHaveBeenCalledOnce();
    });

    it("rejects an unknown user", async () => {
        await expect(DeleteUserUseCase.getInstance().execute(99)).rejects.toThrow("User not found");
    });

    it("propagates storage errors and keeps the account", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser({ id: 7 }));
        tracks.findBy.mockResolvedValueOnce([makeTrack({ storageKey: "sounds/7/a.mp3" })]);
        storageMock.delete.mockRejectedValueOnce(new Error("MinIO down"));

        await expect(DeleteUserUseCase.getInstance().execute(7)).rejects.toThrow("MinIO down");
        expect(users.remove).not.toHaveBeenCalled();
    });
});

describe("AccountActivationUseCase", () => {
    const tokenRow = (overrides = {}) => ({
        id: "1",
        userId: 5,
        tokenHash: TokenHasher.hashToken("raw"),
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    });

    it("returns the same singleton instance", () => {
        expect(AccountActivationUseCase.getInstance()).toBe(AccountActivationUseCase.getInstance());
    });

    it("sets the password, activates the account and consumes the token", async () => {
        const row = tokenRow();
        const user = makeUser({ id: 5, hashedPassword: null, userStatus: UserStatus.PENDING_ACTIVATION });
        tokens.findOne.mockResolvedValueOnce(row);
        users.findOneBy.mockResolvedValueOnce(user);

        const activated = await AccountActivationUseCase.getInstance().execute("raw", "aVeryLongPassword");

        expect(tokens.findOne).toHaveBeenCalledWith({
            where: { tokenHash: TokenHasher.hashToken("raw"), purpose: TokenPurpose.ACCOUNT_ACTIVATION },
            relations: { user: true },
        });
        expect(activated.userStatus).toBe(UserStatus.ACTIVE);
        expect(activated.lastConnection).toBeInstanceOf(Date);
        await expect(PasswordHasher.verify(activated.hashedPassword as string, "aVeryLongPassword")).resolves.toBe(true);
        expect(row.usedAt).toBeInstanceOf(Date);
        expect(tokens.save).toHaveBeenCalledWith(row);
    });

    it("rejects an unknown token", async () => {
        await expect(AccountActivationUseCase.getInstance().execute("raw", "aVeryLongPassword")).rejects.toThrow("Invalid token");
    });

    it("rejects an already used token", async () => {
        tokens.findOne.mockResolvedValueOnce(tokenRow({ usedAt: new Date() }));

        await expect(AccountActivationUseCase.getInstance().execute("raw", "aVeryLongPassword")).rejects.toThrow("Already used token");
    });

    it("rejects an expired token", async () => {
        tokens.findOne.mockResolvedValueOnce(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));

        await expect(AccountActivationUseCase.getInstance().execute("raw", "aVeryLongPassword")).rejects.toThrow("Token is expired");
    });

    it("rejects a token whose user no longer exists", async () => {
        tokens.findOne.mockResolvedValueOnce(tokenRow());

        await expect(AccountActivationUseCase.getInstance().execute("raw", "aVeryLongPassword")).rejects.toThrow("User not found");
    });
});

describe("CreateUserWithRoleUseCase", () => {
    const withKeys = async () => {
        process.env.ADMIN_KEY = await PasswordHasher.hash("admin-secret");
        process.env.SOUND_CREATOR_KEY = await PasswordHasher.hash("creator-secret");
    };

    it("returns the same singleton instance", () => {
        expect(CreateUserWithRoleUseCase.getInstance()).toBe(CreateUserWithRoleUseCase.getInstance());
    });

    it.each([
        [Role.ADMIN, "admin-secret"],
        [Role.SOUND_CREATOR, "creator-secret"],
    ])("creates a pending %s account, emails an activation link and stores a 48h token", async (role, key) => {
        await withKeys();
        users.save.mockImplementationOnce(async (entity: User) => Object.assign(entity, { id: 33 }));

        const created = await CreateUserWithRoleUseCase.getInstance().execute(" staff@gm-test.test ", " staff ", role, key);

        expect(created).toMatchObject({ email: "staff@gm-test.test", username: "staff", role, hashedPassword: null });
        const mail = sendMailMock.mock.calls[0]?.[0];
        const rawToken = new URL(mail.text.match(/http\S+/)[0]).searchParams.get("token") as string;
        const storedToken = tokens.save.mock.calls[0]?.[0];
        expect(storedToken).toMatchObject({ userId: 33, tokenHash: TokenHasher.hashToken(rawToken), purpose: TokenPurpose.ACCOUNT_ACTIVATION });
        const ttlHours = (storedToken.expiresAt.getTime() - Date.now()) / 3_600_000;
        expect(ttlHours).toBeGreaterThan(47.9);
        expect(ttlHours).toBeLessThanOrEqual(48);
    });

    it("refuses an email that is already used", async () => {
        users.findOneBy.mockResolvedValueOnce(makeUser());

        await expect(CreateUserWithRoleUseCase.getInstance().execute("gm@gm-test.test", "x", Role.ADMIN, "admin-secret"))
            .rejects.toThrow("Email is already used");
    });

    it.each([Role.USER, Role.GUEST])("refuses to create %s accounts", async (role) => {
        await expect(CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", role, "any"))
            .rejects.toThrow("You cannot create user/guest accounts");
    });

    it("refuses a wrong role key", async () => {
        await withKeys();

        await expect(CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", Role.ADMIN, "creator-secret"))
            .rejects.toThrow("Token has not match");
        expect(sendMailMock).not.toHaveBeenCalled();
        expect(users.save).not.toHaveBeenCalled();
    });

    it.each([undefined, ""])("refuses when the role key is not configured (%s)", async (key) => {
        if (key === undefined) delete process.env.ADMIN_KEY;
        else process.env.ADMIN_KEY = key;

        await expect(CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", Role.ADMIN, "admin-secret"))
            .rejects.toThrow("Missing token");
        expect(users.save).not.toHaveBeenCalled();
    });

    it("emails the activation link only once the account and its token are saved", async () => {
        await withKeys();
        const order: string[] = [];
        users.save.mockImplementationOnce(async (entity: User) => { order.push("user"); return Object.assign(entity, { id: 33 }); });
        tokens.save.mockImplementationOnce(async (entity: unknown) => { order.push("token"); return entity; });
        sendMailMock.mockImplementationOnce(async () => { order.push("mail"); return { messageId: "m" }; });

        await CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", Role.ADMIN, "admin-secret");

        expect(order).toEqual(["user", "token", "mail"]);
        expect(sendMailMock.mock.calls[0]?.[0].to).toBe("x@gm-test.test");
    });

    it("removes the account when the email cannot be sent", async () => {
        await withKeys();
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", Role.ADMIN, "admin-secret"))
            .rejects.toThrow("SMTP down");
        const saved = users.save.mock.calls[0]?.[0];
        expect(users.remove).toHaveBeenCalledWith(saved);
    });

    it("does not save the account when the role key is wrong", async () => {
        await withKeys();

        await expect(CreateUserWithRoleUseCase.getInstance().execute("x@gm-test.test", "x", Role.SOUND_CREATOR, "admin-secret"))
            .rejects.toThrow("Token has not match");
        expect(users.save).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
    });
});
