import {getMailer} from "../../../infrastructure/email/mailer.js";

export class SendVerificationEmailUseCase {

    private static _instance: SendVerificationEmailUseCase;

    private constructor() { }

    static getInstance(): SendVerificationEmailUseCase {
        if (!SendVerificationEmailUseCase._instance) {
            SendVerificationEmailUseCase._instance = new SendVerificationEmailUseCase();
        }
        return SendVerificationEmailUseCase._instance;
    }

    async execute(email: string, rawToken: string): Promise<string> {
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${rawToken}`;

        const info = await getMailer().sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Gamemaster's Bard - Verify your email",
            replyTo: 'contact@gamemasters-bard.fr',
            text: `Hello\n\nWelcome to Gamemaster's Bard.\n\nVerify your email here: ${verificationUrl}\n\nThis link expires in 48 hours and can only be used once.\n\nIf you did not create an account, please ignore this mail.`,
            html: `
                <p>Hello</p>
                <p>Welcome to Gamemaster's Bard.</p>
                <p><a href="${verificationUrl}">Click here to verify your email</a></p>
                <p>This link will expire in 48 hours and can only be used once.</p>
                <p>If you did not create an account, please ignore this mail.</p>
            `
        });
        return info.messageId;
    }
}
