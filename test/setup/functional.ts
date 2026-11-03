import "reflect-metadata";
import { beforeEach, vi } from "vitest";
import { applyTestEnv } from "./env.js";

applyTestEnv();

vi.mock("../../src/infrastructure/db/AppDataSource.js", async () => {
    const { repositoryFor } = await import("../helpers/mockRepository.js");
    return { AppDataSource: { getRepository: (entity: unknown) => repositoryFor(entity) } };
});

beforeEach(() => {
    vi.resetAllMocks();
});
