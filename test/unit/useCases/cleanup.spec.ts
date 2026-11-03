import { describe, expect, it, vi, afterEach } from "vitest";
import { LessThan } from "typeorm";
import { repositoryFor } from "../../helpers/mockRepository.js";
import { sendMailMock } from "../../helpers/mockStorage.js";
import { makeUser } from "../../helpers/factories.js";
import { User } from "../../../src/infrastructure/db/entities/user.entity.js";
import { WarnInactiveUsersUseCase } from "../../../src/application/useCases/cleanup/WarnInactiveUsersUseCase.js";
import { DeleteInactiveUsersUseCase } from "../../../src/application/useCases/cleanup/DeleteInactiveUsersUseCase.js";
import { SendDeletionWarningEmailUseCase } from "../../../src/application/useCases/cleanup/SendDeletionWarningEmailUseCase.js";
import { UserStatus } from "../../../src/shared/enums/UserStatus.js";

const users = repositoryFor(User);
const NOW = new Date("2026-06-15T12:00:00.000Z");

afterEach(() => {
    vi.useRealTimers();
});

function monthsBefore(months: number): Date {
    const date = new Date(NOW);
    date.setMonth(date.getMonth() - months);
    return date;
}

describe("WarnInactiveUsersUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(WarnInactiveUsersUseCase.getInstance()).toBe(WarnInactiveUsersUseCase.getInstance());
    });

    it("warns active users inactive for 23 months, once", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const inactive = [makeUser({ id: 1, email: "a@gm-test.test" }), makeUser({ id: 2, email: "b@gm-test.test" })];
        users.find.mockResolvedValueOnce(inactive);
        sendMailMock.mockResolvedValue({ messageId: "m" });

        const warned = await WarnInactiveUsersUseCase.getInstance().execute();

        expect(users.find).toHaveBeenCalledWith({
            where: { lastConnection: LessThan(monthsBefore(23)), deletionWarningSent: false, userStatus: UserStatus.ACTIVE },
        });
        expect(sendMailMock.mock.calls.map((call) => call[0].to)).toEqual(["a@gm-test.test", "b@gm-test.test"]);
        expect(users.update).toHaveBeenCalledWith(1, { deletionWarningSent: true });
        expect(users.update).toHaveBeenCalledWith(2, { deletionWarningSent: true });
        expect(warned).toBe(2);
    });

    it("does nothing when nobody is inactive", async () => {
        await expect(WarnInactiveUsersUseCase.getInstance().execute()).resolves.toBe(0);
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("does not flag a user whose warning email failed", async () => {
        users.find.mockResolvedValueOnce([makeUser()]);
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(WarnInactiveUsersUseCase.getInstance().execute()).rejects.toThrow("SMTP down");
        expect(users.update).not.toHaveBeenCalled();
    });
});

describe("DeleteInactiveUsersUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(DeleteInactiveUsersUseCase.getInstance()).toBe(DeleteInactiveUsersUseCase.getInstance());
    });

    it("deletes users inactive for 24 months", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        const inactive = [makeUser({ id: 1 }), makeUser({ id: 2 })];
        users.find.mockResolvedValueOnce(inactive);

        const deleted = await DeleteInactiveUsersUseCase.getInstance().execute();

        expect(users.find).toHaveBeenCalledWith({ where: { lastConnection: LessThan(monthsBefore(24)) } });
        expect(users.remove).toHaveBeenCalledTimes(2);
        expect(deleted).toBe(2);
    });

    it("does nothing when nobody is inactive", async () => {
        await expect(DeleteInactiveUsersUseCase.getInstance().execute()).resolves.toBe(0);
        expect(users.remove).not.toHaveBeenCalled();
    });
});

describe("SendDeletionWarningEmailUseCase", () => {
    it("returns the same singleton instance", () => {
        expect(SendDeletionWarningEmailUseCase.getInstance()).toBe(SendDeletionWarningEmailUseCase.getInstance());
    });

    it("emails the deletion warning with the remaining days", async () => {
        sendMailMock.mockResolvedValueOnce({ messageId: "msg-2" });

        const messageId = await SendDeletionWarningEmailUseCase.getInstance().execute("old@gm-test.test", 30);

        const mail = sendMailMock.mock.calls[0]?.[0];
        expect(messageId).toBe("msg-2");
        expect(mail.to).toBe("old@gm-test.test");
        expect(mail.subject).toContain("Automatic Account Deletion");
        expect(mail.html).toContain("within 30 days");
    });

    it("propagates mailer errors", async () => {
        sendMailMock.mockRejectedValueOnce(new Error("SMTP down"));

        await expect(SendDeletionWarningEmailUseCase.getInstance().execute("old@gm-test.test", 30)).rejects.toThrow("SMTP down");
    });
});
