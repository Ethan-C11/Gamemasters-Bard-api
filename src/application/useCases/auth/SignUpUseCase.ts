import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {PasswordHasher} from "../../../shared/utils/PasswordHasher.js";
import {Role} from "../../../shared/enums/Role.js";

export class SignUpUseCase {

    private static _instance: SignUpUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): SignUpUseCase {
        if (!SignUpUseCase._instance) {
            SignUpUseCase._instance = new SignUpUseCase();
        }
        return SignUpUseCase._instance;
    }

    async execute(email: string, username: string, password: string): Promise<User> {
        const potentielExistingEmail: User | null = await this._userRepository.findOneBy({ email : email });
        if(potentielExistingEmail)
            throw Error("Email is already used");

        const newUser : User = this._userRepository.create({
            email: email,
            username: username,
            hashedPassword : await PasswordHasher.hash(password),
            role : Role.USER,
            isActive : true
        })

        return this._userRepository.save(newUser);
    }
}
