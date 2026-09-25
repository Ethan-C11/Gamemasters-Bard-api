import crypto from 'node:crypto';


const TOKEN_HMAC_SECRET = process.env.TOKEN_HMAC_SECRET ?? "";

export class TokenHasher {
    static hashToken(rawToken: string): string {
        return crypto
            .createHmac('sha256', TOKEN_HMAC_SECRET)
            .update(rawToken)
            .digest('hex');
    }
}

