import type {FastifyPluginAsyncTypebox} from "@fastify/type-provider-typebox";
import {HealthResponse} from "../../../application/dtos/health.schema.js";
import {CheckHealthUseCase} from "../../../application/useCases/health/CheckHealthUseCase.js";

export const healthRoutes: FastifyPluginAsyncTypebox = async (app) => {

    app.get("/health", {
        config: { rateLimit: false },
        schema: {
            tags: ["Health"],
            summary: "Check that the API and its dependencies (database, storage) are reachable",
            response: { 200: HealthResponse, 503: HealthResponse },
        },
    }, async (request, reply) => {
        const report = await CheckHealthUseCase.getInstance().execute();
        return reply.status(report.status === "ok" ? 200 : 503).send(report);
    });
};
