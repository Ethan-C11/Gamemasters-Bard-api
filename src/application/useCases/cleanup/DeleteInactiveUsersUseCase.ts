// useCases/warnInactiveUsers.useCase.ts
import { Repository, LessThan, IsNull } from 'typeorm';
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";
import {SendDeletionWarningEmailUseCase} from "./SendDeletionWarningEmailUseCase.js";
import {MonthsAgo} from "../../../shared/utils/MonthsAgo.js";

import {getInactivityMonthLimit} from "../../../shared/utils/InactivityMonthLimit.js";

export class DeleteInactiveUsersUseCase {

    private static _instance: DeleteInactiveUsersUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): DeleteInactiveUsersUseCase {
        if (!DeleteInactiveUsersUseCase._instance) {
            DeleteInactiveUsersUseCase._instance = new DeleteInactiveUsersUseCase();
        }
        return DeleteInactiveUsersUseCase._instance;
    }

    async execute(): Promise<number> {
        const deleteTriggerDate = MonthsAgo.monthsAgo(getInactivityMonthLimit());

        const userToDelete = await this._userRepository.find({
            where: {
                lastConnection: LessThan(deleteTriggerDate),
            }
        });

        for (const user  of userToDelete) {
            await this._userRepository.remove(user)
        }

        return userToDelete.length;
    }

}