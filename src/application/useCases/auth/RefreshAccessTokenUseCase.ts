import { Repository, IsNull } from 'typeorm';
import { AppDataSource } from '../../../infrastructure/db/AppDataSource.js';
import { RefreshToken } from '../../../infrastructure/db/entities/refreshToken.entity.js';
import { User } from '../../../infrastructure/db/entities/user.entity.js';
import { TokenHasher } from '../../../shared/utils/TokenHasher.js';
import {IssueRefreshTokenUseCase} from "./IssueRefreshTokenUseCase.js";

export class RefreshAccessTokenUseCase {

    private static _instance: RefreshAccessTokenUseCase;

    private _refreshTokenRepository: Repository<RefreshToken>;
    private _userRepository: Repository<User>;

    private constructor() {
        this._refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): RefreshAccessTokenUseCase {
        if (!RefreshAccessTokenUseCase._instance) {
            RefreshAccessTokenUseCase._instance = new RefreshAccessTokenUseCase();
        }
        return RefreshAccessTokenUseCase._instance;
    }

    async execute(rawRefreshToken: string): Promise<{ user: User; newRawRefreshToken: string }> {
        const tokenHash = TokenHasher.hashToken(rawRefreshToken);

        const storedToken = await this._refreshTokenRepository.findOne({
            where: { tokenHash, revokedAt: IsNull() }
        });

        if (!storedToken)
            throw new Error('Invalid refresh token');

        if (new Date() > storedToken.expiresAt)
            throw new Error('Refresh token expired');

        const user = await this._userRepository.findOneBy({ id: storedToken.userId });
        if (!user)
            throw new Error('User not found');

        storedToken.revokedAt = new Date();
        await this._refreshTokenRepository.save(storedToken);

        const newRawRefreshToken = await IssueRefreshTokenUseCase.getInstance().execute(user.id);

        return { user, newRawRefreshToken };
    }
}