import { existsSync } from "node:fs";
import { TEST_ENV } from "./env.js";

export interface IntegrationEnv {
    databaseUrl: string;
    bucket: string;
}

function loadLocalEnvFile(): void {
    if (!process.env.CI && existsSync(".env")) process.loadEnvFile(".env");
}

function toTestDatabaseUrl(url: string): string {
    const parsed = new URL(url);
    const name = parsed.pathname.replace(/^\//, "") || "postgres";
    parsed.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
    return parsed.toString();
}

export function resolveIntegrationEnv(): IntegrationEnv {
    loadLocalEnvFile();

    const sourceUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to run the integration tests");

    const bucket = process.env.TEST_S3_BUCKET ?? `${process.env.S3_BUCKET ?? "audio"}-test`;
    const databaseUrl = process.env.TEST_DATABASE_URL ?? toTestDatabaseUrl(sourceUrl);

    return { databaseUrl, bucket };
}

export function applyIntegrationEnv(): IntegrationEnv {
    const env = resolveIntegrationEnv();

    process.env.DATABASE_URL = env.databaseUrl;
    process.env.S3_BUCKET = env.bucket;
    process.env.S3_REGION = process.env.S3_REGION ?? TEST_ENV.S3_REGION;
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
    process.env.TOKEN_HMAC_SECRET = TEST_ENV.TOKEN_HMAC_SECRET;
    process.env.FRONTEND_URL = TEST_ENV.FRONTEND_URL;
    process.env.EMAIL_FROM = TEST_ENV.EMAIL_FROM;
    process.env.INACTIVITY_MONTH_LIMIT = TEST_ENV.INACTIVITY_MONTH_LIMIT;

    for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
        if (!process.env[key]) throw new Error(`Set ${key} to run the integration tests`);
    }

    return env;
}
