import {IsNull, Repository} from "typeorm";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {ActivationToken} from "../../../infrastructure/db/entities/activationToken.entity.js";
import {RefreshToken} from "../../../infrastructure/db/entities/refreshToken.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {PasswordHasher} from "../../../shared/utils/PasswordHasher.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";
import {Role} from "../../../shared/enums/Role.js";

export class ResetPasswordUseCase {

    private static _instance: ResetPasswordUseCase;

    private _userRepository: Repository<User>;
    private _tokenRepository: Repository<ActivationToken>;
    private _refreshTokenRepository: Repository<RefreshToken>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
        this._refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
    }

    static getInstance(): ResetPasswordUseCase {
        if (!ResetPasswordUseCase._instance) {
            ResetPasswordUseCase._instance = new ResetPasswordUseCase();
        }
        return ResetPasswordUseCase._instance;
    }

    async execute(rawToken: string, password: string): Promise<User> {
        const tokenHash: string = TokenHasher.hashToken(rawToken);
        const tokenRow: ActivationToken | null = await this._tokenRepository.findOneBy({ tokenHash, purpose: TokenPurpose.PASSWORD_RESET });

        if(!tokenRow)
            throw Error("Invalid token");
        if(tokenRow.usedAt)
            throw Error("Already used token");
        if(new Date() > tokenRow.expiresAt)
            throw Error("Token is expired");

        const user: User | null = await this._userRepository.findOneBy({ id: tokenRow.userId });
        if(!user)
            throw Error("User not found");

        if(user.role != Role.USER && password.length < 12)
            throw Error("Password must be at least 12 characters");

        user.hashedPassword = await PasswordHasher.hash(password);
        await this._userRepository.save(user);

        tokenRow.usedAt = new Date();
        await this._tokenRepository.save(tokenRow);

        await this._refreshTokenRepository.update(
            { userId: user.id, revokedAt: IsNull() },
            { revokedAt: new Date() }
        );

        return user;
    }
}
