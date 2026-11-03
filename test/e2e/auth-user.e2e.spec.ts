import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ApiClient, signUpAndSignIn, startTestServer, uniqueEmail, type TestServer } from "../helpers/http.js";
import { sendMailMock } from "../helpers/mockStorage.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { User } from "../../src/infrastructure/db/entities/user.entity.js";
import { PasswordHasher } from "../../src/shared/utils/PasswordHasher.js";
import { Role } from "../../src/shared/enums/Role.js";
import { UserStatus } from "../../src/shared/enums/UserStatus.js";

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
