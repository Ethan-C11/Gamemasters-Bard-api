import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { ApiClient, signUpAndSignIn, startTestServer, uniqueEmail, type TestServer } from "../helpers/http.js";
import { sendMailMock } from "../helpers/mockStorage.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { User } from "../../src/infrastructure/db/entities/user.entity.js";
import { ActivationToken } from "../../src/infrastructure/db/entities/activationToken.entity.js";
import { PasswordHasher } from "../../src/shared/utils/PasswordHasher.js";
import { TokenHasher } from "../../src/shared/utils/TokenHasher.js";
import { Role } from "../../src/shared/enums/Role.js";
import { UserStatus } from "../../src/shared/enums/UserStatus.js";
import { TokenPurpose } from "../../src/shared/enums/TokenPurpose.js";

let server: TestServer;
let api: ApiClient;

beforeAll(async () => {
    server = await startTestServer();
    api = new ApiClient(server.baseUrl);
});

afterAll(async () => {
    await server.close();
});

async function createAdmin(password = "adminPassword1"): Promise<ApiClient> {
    const email = uniqueEmail("admin");
    await AppDataSource.getRepository(User).save(AppDataSource.getRepository(User).create({
        email,
        username: "admin",
        hashedPassword: await PasswordHasher.hash(password),
        role: Role.ADMIN,
        userStatus: UserStatus.ACTIVE,
    }));
    const signin = await api.post("/auth/signin", { email, password });
    return api.withToken(signin.body.token);
}

describe("account lifecycle", () => {
    it("signs up, refreshes, edits, signs in again and deletes the account", async () => {
        const email = uniqueEmail("life");

        const signup = await api.post("/auth/signup", { email, username: "life", password: "password123" });
        expect(signup.status).toBe(201);
        expect(signup.body.refreshToken).toMatch(/^[0-9a-f]{64}$/);

        const duplicate = await api.post("/auth/signup", { email, username: "life", password: "password123" });
        expect(duplicate.status).toBe(400);

        const refreshed = await api.post("/auth/refresh", { refreshToken: signup.body.refreshToken });
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.refreshToken).not.toBe(signup.body.refreshToken);
        expect((await api.post("/auth/refresh", { refreshToken: signup.body.refreshToken })).status).toBe(401);

        const client = api.withToken(refreshed.body.token);
        const edited = await client.put("/user", { username: "renamed", password: "newPassword1" });
        expect(edited.status).toBe(200);
        expect(edited.body.user.username).toBe("renamed");

        expect((await api.post("/auth/signin", { email, password: "password123" })).status).toBe(401);
        const signin = await api.post("/auth/signin", { email, password: "newPassword1" });
        expect(signin.status).toBe(200);

        const stored = await AppDataSource.getRepository(User).findOneByOrFail({ email });
        expect(stored.lastConnection).toBeInstanceOf(Date);

        expect((await client.delete("/user")).status).toBe(200);
        expect((await api.post("/auth/signin", { email, password: "newPassword1" })).status).toBe(401);
        expect((await api.post("/auth/refresh", { refreshToken: signin.body.refreshToken })).status).toBe(401);
    });

    it("rejects calls without a valid token", async () => {
        expect((await api.put("/user", { username: "valid" })).status).toBe(401);
        expect((await api.withToken("forged.token.value").put("/user", { username: "valid" })).status).toBe(401);
    });
});

describe("elevated accounts", () => {
    it("lets an admin create a sound creator who activates the account by email", async () => {
        process.env.SOUND_CREATOR_KEY = await PasswordHasher.hash("creator-key");
        const admin = await createAdmin();
        const email = uniqueEmail("creator");

        const created = await admin.post("/user/admin/create-user", { email, username: "creator", role: Role.SOUND_CREATOR, adminToken: "creator-key" });
        expect(created.status).toBe(200);

        expect((await api.post("/auth/signin", { email, password: "anything" })).status).toBe(401);

        const mail = sendMailMock.mock.calls[0]?.[0];
        expect(mail.to).toBe(email);
        const rawToken = new URL(mail.text.match(/http\S+/)[0]).searchParams.get("token");

        const activated = await api.post("/auth/activate", { token: rawToken, password: "creatorPassword1" });
        expect(activated.status).toBe(200);
        expect((await api.post("/auth/activate", { token: rawToken, password: "creatorPassword1" })).status).toBe(401);

        const signin = await api.post("/auth/signin", { email, password: "creatorPassword1" });
        expect(signin.status).toBe(200);
        const creator = api.withToken(signin.body.token);
        expect((await creator.post("/session", { sessionName: "nope" })).status).toBe(403);

        expect((await admin.delete(`/user/admin/${created.body.user.id}`)).status).toBe(200);
        expect((await api.post("/auth/signin", { email, password: "creatorPassword1" })).status).toBe(401);
    });

    it("leaves no account behind when the activation email fails, so the admin can retry", async () => {
        process.env.SOUND_CREATOR_KEY = await PasswordHasher.hash("creator-key");
        const admin = await createAdmin();
        const email = uniqueEmail("retry");
        const payload = { email, username: "retry", role: Role.SOUND_CREATOR, adminToken: "creator-key" };
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        const failed = await admin.post("/user/admin/create-user", payload);
        expect(failed.status).toBe(400);
        expect(await AppDataSource.getRepository(User).countBy({ email })).toBe(0);

        const retried = await admin.post("/user/admin/create-user", payload);
        expect(retried.status).toBe(200);
        expect(sendMailMock).toHaveBeenCalledTimes(2);
    });

    it("refuses a wrong role key and user accounts", async () => {
        process.env.ADMIN_KEY = await PasswordHasher.hash("admin-key");
        const admin = await createAdmin();

        const wrongKey = await admin.post("/user/admin/create-user", { email: uniqueEmail("x"), username: "x", role: Role.ADMIN, adminToken: "bad-key" });
        expect(wrongKey.status).toBe(400);
        const userRole = await admin.post("/user/admin/create-user", { email: uniqueEmail("x"), username: "x", role: Role.USER, adminToken: "admin-key" });
        expect(userRole.status).toBe(400);
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("forbids admin routes to regular users", async () => {
        const { client, id } = await signUpAndSignIn(api, "regular");

        expect((await client.delete(`/user/admin/${id}`)).status).toBe(403);
        expect((await client.post("/user/admin/create-user", { email: uniqueEmail("x"), username: "x", role: Role.ADMIN, adminToken: "x" })).status).toBe(403);
    });
});

describe("logout", () => {
    it("revokes the given refresh token and leaves the other sessions alone", async () => {
        const { email, refreshToken } = await signUpAndSignIn(api, "logout", "password123");
        const otherDevice = await api.post("/auth/signin", { email, password: "password123" });

        const loggedOut = await api.post("/auth/logout", { refreshToken });
        expect(loggedOut.status).toBe(200);
        expect(loggedOut.body).toEqual({ message: "Logged out" });

        expect((await api.post("/auth/refresh", { refreshToken })).status).toBe(401);
        expect((await api.post("/auth/refresh", { refreshToken: otherDevice.body.refreshToken })).status).toBe(200);
    });

    it("answers 200 for an unknown or already revoked token", async () => {
        const { refreshToken } = await signUpAndSignIn(api, "logout-twice");

        expect((await api.post("/auth/logout", { refreshToken })).status).toBe(200);
        expect((await api.post("/auth/logout", { refreshToken })).status).toBe(200);
        expect((await api.post("/auth/logout", { refreshToken: "unknown" })).status).toBe(200);
    });

    it("rejects a request without refresh token", async () => {
        expect((await api.post("/auth/logout", {})).status).toBe(400);
    });
});

describe("password reset", () => {
    async function resetTokenFromMail(mailIndex = 0): Promise<string> {
        await vi.waitFor(() => expect(sendMailMock.mock.calls.length).toBeGreaterThan(mailIndex));
        const mail = sendMailMock.mock.calls[mailIndex]?.[0];
        return new URL(mail.text.match(/http\S+/)[0]).searchParams.get("token") as string;
    }

    it("resets a forgotten password, revokes the sessions and consumes the link", async () => {
        const { email, refreshToken } = await signUpAndSignIn(api, "forgot", "oldPassword1");

        const requested = await api.post("/auth/forgot-password", { email });
        expect(requested.status).toBe(200);
        const rawToken = await resetTokenFromMail();
        expect(sendMailMock.mock.calls[0]?.[0].to).toBe(email);

        const reset = await api.post("/auth/reset-password", { token: rawToken, password: "brandNewPassword1" });
        expect(reset.status).toBe(200);

        expect((await api.post("/auth/signin", { email, password: "oldPassword1" })).status).toBe(401);
        expect((await api.post("/auth/signin", { email, password: "brandNewPassword1" })).status).toBe(200);
        expect((await api.post("/auth/refresh", { refreshToken })).status).toBe(401);

        const reused = await api.post("/auth/reset-password", { token: rawToken, password: "anotherPassword1" });
        expect(reused.status).toBe(400);
        expect(reused.body.error).toBe("Already used token");
    });

    it("answers the same message for any email and only mails active accounts with a password", async () => {
        const pendingEmail = uniqueEmail("pending");
        await AppDataSource.getRepository(User).save(AppDataSource.getRepository(User).create({
            email: pendingEmail,
            username: "pending",
            hashedPassword: null,
            role: Role.SOUND_CREATOR,
            userStatus: UserStatus.PENDING_ACTIVATION,
        }));
        const { email } = await signUpAndSignIn(api, "known");

        const unknown = await api.post("/auth/forgot-password", { email: uniqueEmail("nobody") });
        const pending = await api.post("/auth/forgot-password", { email: pendingEmail });
        const known = await api.post("/auth/forgot-password", { email });
        await resetTokenFromMail();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(unknown.status).toBe(200);
        expect(pending.body).toEqual(unknown.body);
        expect(known.body).toEqual(unknown.body);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        expect(sendMailMock.mock.calls[0]?.[0].to).toBe(email);
    });

    it("only keeps the latest link valid", async () => {
        const { email } = await signUpAndSignIn(api, "twice", "oldPassword1");

        await api.post("/auth/forgot-password", { email });
        const first = await resetTokenFromMail(0);
        await api.post("/auth/forgot-password", { email });
        const second = await resetTokenFromMail(1);

        const old = await api.post("/auth/reset-password", { token: first, password: "brandNewPassword1" });
        expect(old.status).toBe(400);
        expect(old.body.error).toBe("Already used token");
        expect((await api.post("/auth/reset-password", { token: second, password: "brandNewPassword1" })).status).toBe(200);
    });

    it("refuses an expired link", async () => {
        const { email, id } = await signUpAndSignIn(api, "expired");

        await api.post("/auth/forgot-password", { email });
        const rawToken = await resetTokenFromMail();
        await AppDataSource.getRepository(ActivationToken).update(
            { userId: id, purpose: TokenPurpose.PASSWORD_RESET },
            { expiresAt: new Date(Date.now() - 1000) },
        );

        const reset = await api.post("/auth/reset-password", { token: rawToken, password: "brandNewPassword1" });
        expect(reset.status).toBe(400);
        expect(reset.body.error).toBe("Token is expired");
    });

    it("refuses an unknown token and an activation token", async () => {
        const { id } = await signUpAndSignIn(api, "wrongkind");
        const activationRaw = TokenHasher.generate();
        const tokens = AppDataSource.getRepository(ActivationToken);
        await tokens.save(tokens.create({
            userId: id,
            tokenHash: TokenHasher.hashToken(activationRaw),
            purpose: TokenPurpose.ACCOUNT_ACTIVATION,
            expiresAt: new Date(Date.now() + 60_000),
        }));

        const unknown = await api.post("/auth/reset-password", { token: "unknown", password: "brandNewPassword1" });
        const activation = await api.post("/auth/reset-password", { token: activationRaw, password: "brandNewPassword1" });

        expect(unknown.status).toBe(400);
        expect(activation.status).toBe(400);
        expect(activation.body.error).toBe("Invalid token");
    });

    it("does not let a reset link activate an account", async () => {
        const { email } = await signUpAndSignIn(api, "crosskind", "oldPassword1");

        await api.post("/auth/forgot-password", { email });
        const rawToken = await resetTokenFromMail();

        const activated = await api.post("/auth/activate", { token: rawToken, password: "anotherLongPassword1" });
        expect(activated.status).toBe(401);
        expect(activated.body.error).toBe("Invalid token");
        expect((await api.post("/auth/signin", { email, password: "oldPassword1" })).status).toBe(200);
        expect((await api.post("/auth/reset-password", { token: rawToken, password: "brandNewPassword1" })).status).toBe(200);
    });

    it("requires 12 characters for elevated accounts", async () => {
        const email = uniqueEmail("elevated");
        await AppDataSource.getRepository(User).save(AppDataSource.getRepository(User).create({
            email,
            username: "elevated",
            hashedPassword: await PasswordHasher.hash("adminPassword1"),
            role: Role.ADMIN,
            userStatus: UserStatus.ACTIVE,
        }));

        await api.post("/auth/forgot-password", { email });
        const rawToken = await resetTokenFromMail();

        const short = await api.post("/auth/reset-password", { token: rawToken, password: "short-pass1" });
        expect(short.status).toBe(400);
        expect(short.body.error).toBe("Password must be at least 12 characters");

        expect((await api.post("/auth/reset-password", { token: rawToken, password: "longer-password1" })).status).toBe(200);
        expect((await api.post("/auth/signin", { email, password: "longer-password1" })).status).toBe(200);
    });
});
