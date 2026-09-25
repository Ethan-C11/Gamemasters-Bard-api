import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {Repository} from "typeorm";


export class SendActivationEmailUseCase {

    private static _instance: SendActivationEmailUseCase;

    private _userRepository: Repository<User>;

    private constructor() { }

    static getInstance(): SendActivationEmailUseCase {
        if (!SendActivationEmailUseCase._instance) {
            SendActivationEmailUseCase._instance = new SendActivationEmailUseCase();
        }
        return SendActivationEmailUseCase._instance;
    }

    async execute(email: string, rawToken: string): Promise<string> {
        return "test";
    }
}
