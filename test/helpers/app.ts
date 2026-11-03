import { buildApp, type App } from "../../src/app.js";
import { Role } from "../../src/shared/enums/Role.js";

export async function createTestApp(): Promise<App> {
    const app = await buildApp({ logger: false, rateLimit: false });
    await app.ready();
    return app;
}

export function tokenFor(app: App, role: Role = Role.USER, id = 1, email = "gm@gm-test.test"): string {
    return app.jwt.sign({ id, email, role });
}

export function bearer(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
}
