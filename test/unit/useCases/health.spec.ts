import { describe, expect, it, vi, afterEach } from "vitest";
import { storageMock } from "../../helpers/mockStorage.js";
import { AppDataSource } from "../../../src/infrastructure/db/AppDataSource.js";
import { CheckHealthUseCase } from "../../../src/application/useCases/health/CheckHealthUseCase.js";

const query = AppDataSource.query as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
    vi.useRealTimers();
});

describe("CheckHealthUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(CheckHealthUseCase.getInstance()).toBe(CheckHealthUseCase.getInstance());
    });

    it("reports ok when the database and the storage answer", async () => {
        const report = await CheckHealthUseCase.getInstance().execute();

        expect(report).toEqual({ status: "ok", checks: { database: "up", storage: "up" } });
        expect(query).toHaveBeenCalledWith("SELECT 1");
        expect(storageMock.ping).toHaveBeenCalledOnce();
    });

    it("reports degraded when the database is down", async () => {
        query.mockRejectedValueOnce(new Error("connection terminated"));

        const report = await CheckHealthUseCase.getInstance().execute();

        expect(report).toEqual({ status: "degraded", checks: { database: "down", storage: "up" } });
    });

    it("reports degraded when the storage is down", async () => {
        storageMock.ping.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

        const report = await CheckHealthUseCase.getInstance().execute();

        expect(report).toEqual({ status: "degraded", checks: { database: "up", storage: "down" } });
    });

    it("reports both dependencies down", async () => {
        query.mockRejectedValueOnce(new Error("down"));
        storageMock.ping.mockRejectedValueOnce(new Error("down"));

        const report = await CheckHealthUseCase.getInstance().execute();

        expect(report).toEqual({ status: "degraded", checks: { database: "down", storage: "down" } });
    });

    it("treats a dependency that does not answer within 2 seconds as down", async () => {
        vi.useFakeTimers();
        storageMock.ping.mockReturnValueOnce(new Promise(() => {}));

        const pending = CheckHealthUseCase.getInstance().execute();
        await vi.advanceTimersByTimeAsync(2000);

        await expect(pending).resolves.toEqual({ status: "degraded", checks: { database: "up", storage: "down" } });
    });
});
