import { Session } from "../../../infrastructure/db/entities/session.entity.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {Repository} from "typeorm";
import {generateRandomString} from "../../../shared/utils/GenerateRandomString.js";
import {PasswordHasher} from "../../../shared/utils/PasswordHasher.js";

export class DeleteUserUseCase {

    private static _instance: DeleteUserUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): DeleteUserUseCase {
        if (!DeleteUserUseCase._instance) {
            DeleteUserUseCase._instance = new DeleteUserUseCase();
        }
        return DeleteUserUseCase._instance;
    }

    async execute(userId: number, newUsername: string | undefined = undefined, newEmail : string | undefined = undefined, newPassword: string | undefined = undefined): Promise<User> {
        const user: User | null = await this._userRepository.findOneBy({ id: userId });
        if (!user)
            throw Error("User not found");


        return await this._userRepository.remove(user);
    }
}
