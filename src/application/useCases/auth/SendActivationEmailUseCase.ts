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
                subject: 'Activez votre compte',
                html: `
                <p>Un compte a été créé pour vous.</p>
                <p><a href="${activationUrl}">Cliquez ici pour définir votre mot de passe</a></p>
                <p>Ce lien expire dans 48 heures.</p>
            `
            });
            console.log('Email envoyé, messageId:', info.messageId);
            return info.messageId;

        }catch (err) {
            console.error('Erreur envoi email:', err);
            throw err;
        }
    }
}