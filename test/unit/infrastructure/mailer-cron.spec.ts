import { describe, expect, it, vi } from "vitest";

const createTransport = vi.hoisted(() => vi.fn((options: unknown) => ({ options, sendMail: vi.fn() })));
const schedule = vi.hoisted(() => vi.fn());
const warnExecute = vi.hoisted(() => vi.fn());
const deleteExecute = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("node-cron", () => ({ default: { schedule } }));
vi.mock("../../../src/application/useCases/cleanup/WarnInactiveUsersUseCase.js", () => ({
    WarnInactiveUsersUseCase: { getInstance: () => ({ execute: warnExecute }) },
}));
vi.mock("../../../src/application/useCases/cleanup/DeleteInactiveUsersUseCase.js", () => ({
    DeleteInactiveUsersUseCase: { getInstance: () => ({ execute: deleteExecute }) },
}));

type MailerModule = typeof import("../../../src/infrastructure/email/mailer.js");
const { getMailer } = await vi.importActual<MailerModule>("../../../src/infrastructure/email/mailer.js");
const { registerGdprCleanupCron } = await import("../../../src/infrastructure/scheduler/gdprCleanup.cron.js");

describe("getMailer", () => {
    it("creates a single SMTP transport configured from the environment", () => {
        process.env.BREVO_SMTP_HOST = "smtp.test";
        process.env.BREVO_SMTP_PORT = "587";
        process.env.BREVO_SMTP_LOGIN = "login";
        process.env.BREVO_SMTP_KEY = "key";

        const first = getMailer();
        const second = getMailer();

        expect(first).toBe(second);
        expect(createTransport).toHaveBeenCalledTimes(1);
        expect(createTransport).toHaveBeenCalledWith({
            host: "smtp.test",
            port: 587,
            secure: false,
            auth: { user: "login", pass: "key" },
        });
    });
});

describe("registerGdprCleanupCron", () => {
    const registerAndGetJob = () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        registerGdprCleanupCron();
        expect(schedule).toHaveBeenCalledWith("0 3 * * *", expect.any(Function));
        return schedule.mock.calls[0]?.[1] as () => Promise<void>;
    };

    it("schedules a daily job at 3am that warns then deletes inactive users", async () => {
        const order: string[] = [];
        warnExecute.mockImplementationOnce(async () => order.push("warn"));
        deleteExecute.mockImplementationOnce(async () => order.push("delete"));

        await registerAndGetJob()();

        expect(order).toEqual(["warn", "delete"]);
    });

    it("propagates job errors", async () => {
        warnExecute.mockRejectedValueOnce(new Error("db down"));

        await expect(registerAndGetJob()()).rejects.toThrow("db down");
        expect(deleteExecute).not.toHaveBeenCalled();
    });
});
