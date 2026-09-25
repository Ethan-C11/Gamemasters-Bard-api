import cron from 'node-cron';
import {DeleteInactiveUsersUseCase} from "../../application/useCases/cleanup/DeleteInactiveUsersUseCase.js";
import {WarnInactiveUsersUseCase} from "../../application/useCases/cleanup/WarnInactiveUsersUseCase.js";


export function registerGdprCleanupCron(): void {
    console.log("Polling started")
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log("Starting warning and deleting process")
            const warned = await WarnInactiveUsersUseCase.getInstance().execute();
            const deleted = await DeleteInactiveUsersUseCase.getInstance().execute();
        } catch (err) {
            throw err;
        }
    });
}