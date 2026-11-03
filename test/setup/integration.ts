import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { applyIntegrationEnv } from "./integration-env.js";

applyIntegrationEnv();

vi.mock("../../src/infrastructure/email/mailer.js", async () => {
    const { sendMailMock } = await import("../helpers/mockStorage.js");
    return { getMailer: () => ({ sendMail: sendMailMock }) };
});

const { AppDataSource } = await import("../../src/infrastructure/db/AppDataSource.js");
const { MinioStorageService } = await import("../../src/infrastructure/storage/MinioStorageService.js");
const { sendMailMock } = await import("../helpers/mockStorage.js");

export async function resetIntegrationState(): Promise<void> {
    await AppDataSource.synchronize(true);
    const storage = MinioStorageService.getInstance();
    for (const key of await storage.listByPrefix("")) await storage.delete(key);
}

beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await MinioStorageService.getInstance().ensureBucketExists();
    await resetIntegrationState();
});

beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: "test-message-id" });
});

afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
