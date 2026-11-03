import { vi, type Mock } from "vitest";

export interface MockRepository {
    find: Mock;
    findOne: Mock;
    findOneBy: Mock;
    findBy: Mock;
    findAndCount: Mock;
    exists: Mock;
    create: Mock;
    save: Mock;
    remove: Mock;
    update: Mock;
}

export function createMockRepository(): MockRepository {
    return {
        find: vi.fn(async () => []),
        findOne: vi.fn(async () => null),
        findOneBy: vi.fn(async () => null),
        findBy: vi.fn(async () => []),
        findAndCount: vi.fn(async () => [[], 0]),
        exists: vi.fn(async () => false),
        create: vi.fn((entity: unknown) => entity),
        save: vi.fn(async (entity: unknown) => entity),
        remove: vi.fn(async (entity: unknown) => entity),
        update: vi.fn(async () => ({ affected: 1 })),
    };
}

const repositories = new Map<unknown, MockRepository>();

export function repositoryFor(entity: unknown): MockRepository {
    let repository = repositories.get(entity);
    if (!repository) {
        repository = createMockRepository();
        repositories.set(entity, repository);
    }
    return repository;
}
