export const TEST_ENV: Record<string, string> = {
    JWT_SECRET: "test-jwt-secret-that-is-long-enough",
    TOKEN_HMAC_SECRET: "test-hmac-secret",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "audio-test",
    S3_ACCESS_KEY: "test-access-key",
    S3_SECRET_KEY: "test-secret-key",
    FRONTEND_URL: "http://frontend.test",
    EMAIL_FROM: "no-reply@gm-test.test",
    INACTIVITY_MONTH_LIMIT: "24",
};

export function applyTestEnv(overrides: Record<string, string | undefined> = {}): void {
    for (const [key, value] of Object.entries({ ...TEST_ENV, ...overrides })) {
        if (value !== undefined) process.env[key] = value;
    }
}
