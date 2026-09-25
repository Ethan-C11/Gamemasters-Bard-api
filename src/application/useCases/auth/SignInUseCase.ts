import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {PasswordHasher} from "../../../shared/utils/PasswordHasher.js";
import {Role} from "../../../shared/enums/Role.js";

export class SignInUseCase {

    private static _instance: SignInUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): SignInUseCase {
        if (!SignInUseCase._instance) {
            SignInUseCase._instance = new SignInUseCase();
        }
        return SignInUseCase._instance;
    }

    async execute(email: string, plainPassword: string): Promise<User> {
        const user: User | null = await this._userRepository.findOneBy({ email : email });
        if(!user)
            throw Error("No account with this email exist");

        if(user.hashedPassword === null)
            throw Error("User is not active");

        const passwordCheck = await PasswordHasher.verify(user.hashedPassword, plainPassword)
        if(!passwordCheck)
            throw Error("Incorrect password");

        return user;
    }
}
