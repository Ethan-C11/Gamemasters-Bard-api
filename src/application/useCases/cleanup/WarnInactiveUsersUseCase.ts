// useCases/warnInactiveUsers.useCase.ts
import { Repository, LessThan, IsNull } from 'typeorm';
import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {User} from "../../../infrastructure/db/entities/user.entity.js";
import {UserStatus} from "../../../shared/enums/UserStatus.js";
import {SendDeletionWarningEmailUseCase} from "./SendDeletionWarningEmailUseCase.js";
import {MonthsAgo} from "../../../shared/utils/MonthsAgo.js";

const inactivityMonthLimit: number = Number(process.env.INACTIVITY_MONTH_LIMIT) ?? 24;
const warningBeforeDeletionDays = 30;

export class WarnInactiveUsersUseCase {

    private static _instance: WarnInactiveUsersUseCase;

    private _userRepository: Repository<User>;

    private constructor() {
        this._userRepository = AppDataSource.getRepository(User);
    }

    static getInstance(): WarnInactiveUsersUseCase {
        if (!WarnInactiveUsersUseCase._instance) {
            WarnInactiveUsersUseCase._instance = new WarnInactiveUsersUseCase();
        }
        return WarnInactiveUsersUseCase._instance;
    }

    async execute(): Promise<number> {
        const warningTriggerDate = MonthsAgo.monthsAgo(inactivityMonthLimit - 1);

        const usersToWarn = await this._userRepository.find({
            where: {
                lastConnection: LessThan(warningTriggerDate),
                deletionWarningSent: false,
                userStatus: UserStatus.ACTIVE
            }
        });

        const sendWarningEmail = SendDeletionWarningEmailUseCase.getInstance();

        for (const user of usersToWarn) {
            await sendWarningEmail.execute(user.email, warningBeforeDeletionDays);
            await this._userRepository.update(user.id, { deletionWarningSent: true });
        }

        return usersToWarn.length;
    }

}