import {Repository} from "typeorm";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {ActivationToken} from "../../../infrastructure/db/entities/activationToken.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";

export class VerifyEmailUseCase {

    private static _instance: VerifyEmailUseCase;

    private _userRepository: Repository<User>;
    private _tokenRepository: Repository<ActivationToken>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
    }

    static getInstance(): VerifyEmailUseCase {
        if (!VerifyEmailUseCase._instance) {
            VerifyEmailUseCase._instance = new VerifyEmailUseCase();
        }
        return VerifyEmailUseCase._instance;
    }

    async execute(rawToken: string): Promise<User> {
        const tokenHash : string = TokenHasher.hashToken(rawToken);
        const tokenRow = await this._tokenRepository.findOneBy({ tokenHash, purpose: TokenPurpose.EMAIL_VERIFICATION });

        if(!tokenRow) throw new Error("Invalid token")
        if(tokenRow.usedAt) throw new Error("Already used token")
        if (new Date() > tokenRow.expiresAt) throw new Error('Token is expired');

        const user = await this._userRepository.findOneBy({id: tokenRow.userId})

        if(user == null) throw new Error("User not found")

        user.userStatus = UserStatus.ACTIVE;

        await this._userRepository.save(user)

        tokenRow.usedAt = new Date()
        await this._tokenRepository.save(tokenRow)

        return user;
    }
}
