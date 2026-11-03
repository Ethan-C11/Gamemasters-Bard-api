import { describe, expect, it } from "vitest";
import { sendMailMock } from "../helpers/mockStorage.js";
import { uniqueEmail } from "../helpers/http.js";
import { AppDataSource } from "../../src/infrastructure/db/AppDataSource.js";
import { User } from "../../src/infrastructure/db/entities/user.entity.js";
import { WarnInactiveUsersUseCase } from "../../src/application/useCases/cleanup/WarnInactiveUsersUseCase.js";
import { DeleteInactiveUsersUseCase } from "../../src/application/useCases/cleanup/DeleteInactiveUsersUseCase.js";
import { MonthsAgo } from "../../src/shared/utils/MonthsAgo.js";
import { UserStatus } from "../../src/shared/enums/UserStatus.js";

async function givenUser(lastConnectionMonthsAgo: number, overrides: Partial<User> = {}): Promise<User> {
    const repository = AppDataSource.getRepository(User);
    return repository.save(repository.create({
        email: uniqueEmail("gdpr"),
        username: "gdpr",
        hashedPassword: "hash",
        userStatus: UserStatus.ACTIVE,
        lastConnection: MonthsAgo.monthsAgo(lastConnectionMonthsAgo),
        ...overrides,
    }));
}

describe("GDPR inactive accounts cleanup", () => {
    it("warns accounts inactive for 23 months once, then deletes those inactive for 24 months", async () => {
        const recent = await givenUser(1);
        const toWarn = await givenUser(23, { lastConnection: new Date(MonthsAgo.monthsAgo(23).getTime() - 86_400_000) });
        const toDelete = await givenUser(25, { deletionWarningSent: true });
        const disabled = await givenUser(23.5, { userStatus: UserStatus.DISABLED, lastConnection: new Date(MonthsAgo.monthsAgo(23).getTime() - 86_400_000) });

        const warned = await WarnInactiveUsersUseCase.getInstance().execute();

        expect(warned).toBe(1);
        expect(sendMailMock.mock.calls.map((call) => call[0].to)).toEqual([toWarn.email]);
        expect((await AppDataSource.getRepository(User).findOneByOrFail({ id: toWarn.id })).deletionWarningSent).toBe(true);
        await expect(WarnInactiveUsersUseCase.getInstance().execute()).resolves.toBe(0);

        const deleted = await DeleteInactiveUsersUseCase.getInstance().execute();

        expect(deleted).toBe(1);
        const remaining = (await AppDataSource.getRepository(User).find()).map((user) => user.id);
        expect(remaining).toEqual(expect.arrayContaining([recent.id, toWarn.id, disabled.id]));
        expect(remaining).not.toContain(toDelete.id);
    });
});
