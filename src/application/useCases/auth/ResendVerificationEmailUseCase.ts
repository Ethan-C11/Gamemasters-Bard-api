import {Repository} from "typeorm";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";
import {RequestEmailVerificationUseCase} from "./RequestEmailVerificationUseCase.js";

export class ResendVerificationEmailUseCase {

    private static _instance: ResendVerificationEmailUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): ResendVerificationEmailUseCase {
        if (!ResendVerificationEmailUseCase._instance) {
            ResendVerificationEmailUseCase._instance = new ResendVerificationEmailUseCase();
        }
        return ResendVerificationEmailUseCase._instance;
    }

    async execute(email: string): Promise<void> {
        const user: User | null = await this._userRepository.findOneBy({ email : email });
        if(!user || user.hashedPassword === null || user.userStatus != UserStatus.PENDING_ACTIVATION)
            return;

        await RequestEmailVerificationUseCase.getInstance().execute(user);
    }
}
