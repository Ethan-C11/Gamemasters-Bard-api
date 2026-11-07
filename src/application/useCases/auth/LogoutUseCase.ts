import {IsNull, Repository} from "typeorm";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {RefreshToken} from "../../../infrastructure/db/entities/refreshToken.entity.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";

export class LogoutUseCase {

    private static _instance: LogoutUseCase;

    private _refreshTokenRepository: Repository<RefreshToken>;

    private constructor() {
        this._refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
    }

    static getInstance(): LogoutUseCase {
        if (!LogoutUseCase._instance) {
            LogoutUseCase._instance = new LogoutUseCase();
        }
        return LogoutUseCase._instance;
    }

    async execute(rawRefreshToken: string): Promise<void> {
        await this._refreshTokenRepository.update(
            { tokenHash: TokenHasher.hashToken(rawRefreshToken), revokedAt: IsNull() },
            { revokedAt: new Date() }
        );
    }
}
