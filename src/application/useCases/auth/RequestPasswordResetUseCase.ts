import {IsNull, Repository} from "typeorm";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {ActivationToken} from "../../../infrastructure/db/entities/activationToken.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";
import {SendPasswordResetEmailUseCase} from "./SendPasswordResetEmailUseCase.js";

export class RequestPasswordResetUseCase {

    private static _instance: RequestPasswordResetUseCase;

    private _userRepository: Repository<User>;
    private _tokenRepository: Repository<ActivationToken>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
    }

    static getInstance(): RequestPasswordResetUseCase {
        if (!RequestPasswordResetUseCase._instance) {
            RequestPasswordResetUseCase._instance = new RequestPasswordResetUseCase();
        }
        return RequestPasswordResetUseCase._instance;
    }

    async execute(email: string): Promise<void> {
        const TOKEN_TTL_HOURS = 1;

        const user: User | null = await this._userRepository.findOneBy({ email : email });
        if(!user || user.hashedPassword === null || user.userStatus != UserStatus.ACTIVE)
            return;

        await this._tokenRepository.update(
            { userId: user.id, purpose: TokenPurpose.PASSWORD_RESET, usedAt: IsNull() },
            { usedAt: new Date() }
        );

        const rawToken = TokenHasher.generate();

        const token = this._tokenRepository.create({
            user: user,
            userId: user.id,
            tokenHash: TokenHasher.hashToken(rawToken),
            purpose: TokenPurpose.PASSWORD_RESET,
            expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000)
        });

        await this._tokenRepository.save(token);

        await SendPasswordResetEmailUseCase.getInstance().execute(user.email, rawToken);
    }
}
