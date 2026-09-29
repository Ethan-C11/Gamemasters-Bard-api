import { Repository } from 'typeorm';
import { AppDataSource } from '../../../infrastructure/db/AppDataSource.js';
import { RefreshToken } from '../../../infrastructure/db/entities/refreshToken.entity.js';
import { TokenHasher } from '../../../shared/utils/TokenHasher.js';

const REFRESH_TOKEN_TTL_DAYS = 30;

export class IssueRefreshTokenUseCase {

    private static _instance: IssueRefreshTokenUseCase;

    private _refreshTokenRepository: Repository<RefreshToken>;

    private constructor() {
        this._refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
    }

    static getInstance(): IssueRefreshTokenUseCase {
        if (!IssueRefreshTokenUseCase._instance) {
            IssueRefreshTokenUseCase._instance = new IssueRefreshTokenUseCase();
        }
        return IssueRefreshTokenUseCase._instance;
    }

    async execute(userId: number): Promise<string> {
        const rawToken = TokenHasher.generate();
        const tokenHash = TokenHasher.hashToken(rawToken);

        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

        const refreshToken = this._refreshTokenRepository.create({
            userId,
            tokenHash,
            expiresAt,
            revokedAt: null
        });
        await this._refreshTokenRepository.save(refreshToken);

        return rawToken;
    }
}