import {getMailer} from "../../../infrastructure/email/mailer.js";

export class SendPasswordResetEmailUseCase {

    private static _instance: SendPasswordResetEmailUseCase;

    private constructor() { }

    static getInstance(): SendPasswordResetEmailUseCase {
        if (!SendPasswordResetEmailUseCase._instance) {
            SendPasswordResetEmailUseCase._instance = new SendPasswordResetEmailUseCase();
        }
        return SendPasswordResetEmailUseCase._instance;
    }

    async execute(email: string, rawToken: string): Promise<string> {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

        const info = await getMailer().sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Gamemaster's Bard - Reset your password",
            replyTo: 'contact@gamemasters-bard.fr',
            text: `Hello\n\nA password reset was requested for your Gamemaster's Bard account.\n\nChoose a new password here: ${resetUrl}\n\nThis link expires in 1 hour and can only be used once.\n\nIf you did not ask for this, please ignore this mail, your password will not change.`,
            html: `
                <p>Hello</p>
                <p>A password reset was requested for your Gamemaster's Bard account.</p>
                <p><a href="${resetUrl}">Click here to choose a new password</a></p>
                <p>This link will expire in 1 hour and can only be used once.</p>
                <p>If you did not ask for this, please ignore this mail, your password will not change.</p>
            `
        });
        return info.messageId;
    }
}
