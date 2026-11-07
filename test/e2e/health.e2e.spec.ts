import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ApiClient, startTestServer, type TestServer } from "../helpers/http.js";

let server: TestServer;
let api: ApiClient;

beforeAll(async () => {
    server = await startTestServer();
    api = new ApiClient(server.baseUrl);
});

afterAll(async () => {
    await server.close();
});

describe("health check", () => {
    it("reports the real database and storage as up without authentication", async () => {
        const res = await api.request("GET", "/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok", checks: { database: "up", storage: "up" } });
    });
});
