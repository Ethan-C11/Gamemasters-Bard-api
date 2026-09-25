import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter;

export function getMailer(): Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.BREVO_SMTP_HOST,
            port: Number(process.env.BREVO_SMTP_PORT),
            secure: false, // false pour le port 587 (STARTTLS), true pour le 465
            auth: {
                user: process.env.BREVO_SMTP_LOGIN,
                pass: process.env.BREVO_SMTP_KEY
            }
        });
    }
    return transporter;
}