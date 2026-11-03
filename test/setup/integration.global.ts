import pg from "pg";
import { resolveIntegrationEnv } from "./integration-env.js";

export default async function setup(): Promise<void> {
    const { databaseUrl } = resolveIntegrationEnv();
    const target = new URL(databaseUrl);
    const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ""));

    const admin = new URL(databaseUrl);
    admin.pathname = "/postgres";

    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    try {
        const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
        if (exists.rowCount === 0) {
            await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
        }
    } finally {
        await client.end();
    }
}
