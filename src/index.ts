import 'reflect-metadata'
import 'dotenv/config'
import {buildApp} from "./app.js";
import {AppDataSource} from "./infrastructure/db/AppDataSource.js";
import {MinioStorageService} from "./infrastructure/storage/MinioStorageService.js";
import {registerGdprCleanupCron} from "./infrastructure/scheduler/gdprCleanup.cron.js";

const fastify = await buildApp();

await MinioStorageService.getInstance().ensureBucketExists();

const start = async () => {
    try {
        await AppDataSource.initialize()
        fastify.log.info('Database connected')

        await fastify.listen({
            port: Number(process.env.PORT ?? 3001),
            host: process.env.HOST ?? '127.0.0.1'
        })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start();
registerGdprCleanupCron();
