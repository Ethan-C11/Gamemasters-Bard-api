import {AppDataSource} from "../../../infrastructure/db/AppDataSource.js";
import {MinioStorageService} from "../../../infrastructure/storage/MinioStorageService.js";
import {HealthResponse} from "../../dtos/health.schema.js";

const PROBE_TIMEOUT_MS = 2000;

export class CheckHealthUseCase {

    private static _instance: CheckHealthUseCase;

    private constructor() { }

    static getInstance(): CheckHealthUseCase {
        if (!CheckHealthUseCase._instance) {
            CheckHealthUseCase._instance = new CheckHealthUseCase();
        }
        return CheckHealthUseCase._instance;
    }

    async execute(): Promise<HealthResponse> {
        const [database, storage] = await Promise.all([
            this.probe(() => AppDataSource.query("SELECT 1")),
            this.probe(() => MinioStorageService.getInstance().ping()),
        ]);

        return {
            status: database === "up" && storage === "up" ? "ok" : "degraded",
            checks: { database, storage },
        };
    }

    private async probe(check: () => Promise<unknown>): Promise<"up" | "down"> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Probe timed out")), PROBE_TIMEOUT_MS);
        });

        try {
            await Promise.race([check(), timeout]);
            return "up";
        } catch {
            return "down";
        } finally {
            clearTimeout(timer);
        }
    }
}
