import "reflect-metadata";
import { beforeEach, vi } from "vitest";
import { applyTestEnv } from "./env.js";

applyTestEnv();

vi.mock("../../src/infrastructure/db/AppDataSource.js", async () => {
    const { repositoryFor } = await import("../helpers/mockRepository.js");
    return { AppDataSource: { getRepository: (entity: unknown) => repositoryFor(entity) } };
});

vi.mock("../../src/infrastructure/storage/MinioStorageService.js", async () => {
    const { storageMock } = await import("../helpers/mockStorage.js");
    return { MinioStorageService: { getInstance: () => storageMock } };
});

vi.mock("../../src/infrastructure/email/mailer.js", async () => {
    const { sendMailMock } = await import("../helpers/mockStorage.js");
    return { getMailer: () => ({ sendMail: sendMailMock }) };
});

beforeEach(() => {
    vi.resetAllMocks();
});
