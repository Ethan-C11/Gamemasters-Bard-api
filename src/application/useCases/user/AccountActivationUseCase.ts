import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {Role} from "../../../shared/enums/Role.js";
import {ActivationToken} from "../../../infrastructure/db/entities/activationToken.entity.js";
import crypto from 'node:crypto';
import {PasswordHasher} from "../../../shared/utils/PasswordHasher.js";
import {TokenPurpose} from "../../../shared/enums/TokenPurpose.js";
import {SendActivationEmailUseCase} from "../auth/SendActivationEmailUseCase.js";
import {TokenHasher} from "../../../shared/utils/TokenHasher.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";

export class AccountActivationUseCase {

    private static _instance: AccountActivationUseCase;

    private _userRepository: Repository<User>;
    private _tokenRepository: Repository<ActivationToken>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
    }

    static getInstance(): AccountActivationUseCase {
        if (!AccountActivationUseCase._instance) {
            AccountActivationUseCase._instance = new AccountActivationUseCase();
        }
        return AccountActivationUseCase._instance;
    }

    async execute(rawToken: string, password: string): Promise<User> {
        const tokenHash : string = TokenHasher.hashToken(rawToken);
        const tokenRow = await this._tokenRepository.findOne({ where: { tokenHash }, relations : {user: true}})

        if(!tokenRow) throw new Error("Invalid token")
        if(tokenRow.usedAt) throw new Error("Already used token")
        if (new Date() > tokenRow.expiresAt) throw new Error('Token is expired');

        const passwordHash = await PasswordHasher.hash(password)

        const user = await this._userRepository.findOneBy({id: tokenRow.userId})

        if(user == null) throw new Error("User not found")

        user.hashedPassword = passwordHash;
        user.userStatus = UserStatus.ACTIVE;
        user.lastConnection = new Date();

        await this._userRepository.save(user)

        tokenRow.usedAt = new Date()
        await this._tokenRepository.save(tokenRow)

        return user;
    }
}
