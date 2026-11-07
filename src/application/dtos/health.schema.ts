import { Type, Static } from "@fastify/type-provider-typebox";

export const HealthResponse = Type.Object({
    status: Type.String(),
    checks: Type.Object({
        database: Type.String(),
        storage: Type.String(),
    }),
});
export type HealthResponse = Static<typeof HealthResponse>;
