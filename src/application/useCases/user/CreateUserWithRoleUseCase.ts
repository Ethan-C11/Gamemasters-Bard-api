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

export class CreateUserWithRoleUseCase {

    private static _instance: CreateUserWithRoleUseCase;

    private _userRepository: Repository<User>;
    private _tokenRepository: Repository<ActivationToken>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
        this._tokenRepository = AppDataSource.getRepository(ActivationToken);
    }

    static getInstance(): CreateUserWithRoleUseCase {
        if (!CreateUserWithRoleUseCase._instance) {
            CreateUserWithRoleUseCase._instance = new CreateUserWithRoleUseCase();
        }
        return CreateUserWithRoleUseCase._instance;
    }

    async execute(email: string, username: string, role: Role, authToken: string): Promise<User> {
        const TOKEN_TTL_HOURS = 48;

        const potentialExistingEmail: User | null = await this._userRepository.findOneBy({ email : email });
        if(potentialExistingEmail)
            throw Error("Email is already used");

        let hashedAuthToken : string;

        if(role == Role.ADMIN)
            hashedAuthToken = process.env.ADMIN_KEY ?? "";
        else if (role == Role.SOUND_CREATOR)
            hashedAuthToken = process.env.SOUND_CREATOR_KEY ?? "";
        else
            throw Error("You cannot create user/guest accounts");

        if(hashedAuthToken == undefined)
            throw Error("Missing token")

        if(!(await PasswordHasher.verify(hashedAuthToken, authToken)))
            throw Error("Token has not match");

        const newUser : User = this._userRepository.create({
            email: email.trim(),
            username: username.trim(),
            role : role,
            hashedPassword: null,
        })

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = TokenHasher.hashToken(rawToken);

        await SendActivationEmailUseCase.getInstance().execute(email, rawToken)

        await this._userRepository.save(newUser);

        const token = this._tokenRepository.create({
            user: newUser,
            userId: newUser.id,
            tokenHash: tokenHash,
            purpose: TokenPurpose.ACCOUNT_ACTIVATION,
            expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000)
        });

        await this._tokenRepository.save(token);

        return newUser;
    }
}
