import { Repository } from 'typeorm';
import {getMailer} from "../../../infrastructure/email/mailer.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";


export class SendDeletionWarningEmailUseCase {

    private static _instance: SendDeletionWarningEmailUseCase;

    private _userRepository: Repository<User>;

    private constructor() { }

    static getInstance(): SendDeletionWarningEmailUseCase {
        if (!SendDeletionWarningEmailUseCase._instance) {
            SendDeletionWarningEmailUseCase._instance = new SendDeletionWarningEmailUseCase();
        }
        return SendDeletionWarningEmailUseCase._instance;
    }

    async execute(email: string, warningBeforeDeletionDays: number): Promise<string> {
        try{
            const info = await getMailer().sendMail({
                from: process.env.EMAIL_FROM,
                to: email,
                replyTo: 'contact@gamemasters-bard.fr',
                subject: "Gamemaster's Bard - Automatic Account Deletion",
                text:"Hello\n\nYour account has been inactive for nearly 2 years.\n\nIf you do not come back within ${warningBeforeDeletionDays} days, your account will be permanently deleted.\n\nThis will also delete all uploaded sounds with no way to restore them.\n\nThis will also delete all uploaded sounds with no way to restore them.\n\nWe hope to see you soon !\n\n\nIf you do not own an account at Gamemaster's Bard, please ignore this mail",
                html: `
                <p>Hello</p>
                <p>Your account has been inactive for nearly 2 years.</p>
                <p>If you do not come back within ${warningBeforeDeletionDays} days, your account will be permanently deleted.</p>
                <p>This will also delete all uploaded sounds with no way to restore them.</p>
                <p>We hope to see you soon !</p>
                
                <p>If you do not own an account at Gamemaster's Bard, please ignore this mail</p>
            `
            });
            return info.messageId;

        }catch (err) {
            throw err;
        }
    }
}