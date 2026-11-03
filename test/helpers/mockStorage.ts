import { vi, type Mock } from "vitest";

export interface MockStorage {
    ensureBucketExists: Mock;
    upload: Mock;
    download: Mock;
    getSignedUrl: Mock;
    delete: Mock;
    listByPrefix: Mock;
}

export const storageMock: MockStorage = {
    ensureBucketExists: vi.fn(async () => undefined),
    upload: vi.fn(async () => undefined),
    download: vi.fn(),
    getSignedUrl: vi.fn(async () => "http://signed.test"),
    delete: vi.fn(async () => undefined),
    listByPrefix: vi.fn(async () => []),
};

export const sendMailMock: Mock = vi.fn(async () => ({ messageId: "test-message-id" }));
