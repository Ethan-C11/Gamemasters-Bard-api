import {IsNull, Repository} from "typeorm";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {ActivationToken} from "../../../infrastructure/db/entities/activationToken.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";
import {SendVerificationEmailUseCase} from "./SendVerificationEmailUseCase.js";

export class RequestEmailVerificationUseCase {

    private static _instance: RequestEmailVerificationUseCase;

    private _tokenRepository: Repository<ActivationToken>;

    private constructor() {
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
    }

    static getInstance(): RequestEmailVerificationUseCase {
        if (!RequestEmailVerificationUseCase._instance) {
            RequestEmailVerificationUseCase._instance = new RequestEmailVerificationUseCase();
        }
        return RequestEmailVerificationUseCase._instance;
    }

    async execute(user: User): Promise<void> {
        const TOKEN_TTL_HOURS = 48;

        await this._tokenRepository.update(
            { userId: user.id, purpose: TokenPurpose.EMAIL_VERIFICATION, usedAt: IsNull() },
            { usedAt: new Date() }
        );

        const rawToken = TokenHasher.generate();

        const token = this._tokenRepository.create({
            user: user,
            userId: user.id,
            tokenHash: TokenHasher.hashToken(rawToken),
            purpose: TokenPurpose.EMAIL_VERIFICATION,
            expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000)
        });

        await this._tokenRepository.save(token);

        await SendVerificationEmailUseCase.getInstance().execute(user.email, rawToken);
    }
}
