import { Repository } from 'typeorm';
import {getMailer} from "../../../infrastructure/email/mailer.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";


export class SendActivationEmailUseCase {

    private static _instance: SendActivationEmailUseCase;

    private _userRepository: Repository<User>;

    private constructor() { }

    static getInstance(): SendActivationEmailUseCase {
        if (!SendActivationEmailUseCase._instance) {
            SendActivationEmailUseCase._instance = new SendActivationEmailUseCase();
        }
        return SendActivationEmailUseCase._instance;
    }

    async execute(email: string, rawToken: string): Promise<string> {
        const activationUrl = `${process.env.FRONTEND_URL}/activate?token=${rawToken}`;

        try{
            const info = await getMailer().sendMail({
                from: process.env.EMAIL_FROM,
                to: email,
                subject: "Gamemaster's Bard - Activate your account",
                replyTo: 'contact@gamemasters-bard.fr',
                text: `An elevated account was created for you on Gamemaster's Bard.\n\nSet your password here: ${activationUrl}\n\nThis link expires in 48 hours.\n\nIf you do not recognize the sender or are not supposed to have an account, please ignore this mail.`,
                html: `
                <p>An elevated account was created for you</p>
                <p><a href="${activationUrl}">Click here to set your password and activate the account</a></p>
                <p>This link will expire in 48 hours.</p>
                <p>If you do not recognize the sender or are not supposed to have an account, please ignore this mail</p>
            `
            });
            return info.messageId;

        }catch (err) {
            throw err;
        }
    }
}