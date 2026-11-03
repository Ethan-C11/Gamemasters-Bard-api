import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

const integrationSetup = {
    globalSetup: ["test/setup/integration.global.ts"],
    setupFiles: ["test/setup/integration.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
};

export default defineConfig({
    oxc: false,
    plugins: [
        swc.vite({
            jsc: {
                parser: { syntax: "typescript", decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
                target: "es2022",
            },
        }),
    ],
    test: {
        restoreMocks: false,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: [
                "src/index.ts",
                "src/**/*.d.ts",
                "src/domain/**",
                "src/presentation/websocket/**",
                "src/infrastructure/realtime/**",
                "src/application/useCases/playback/**",
                "src/shared/errors/**",
                "src/shared/interfaces/**",
            ],
            reporter: ["text", "html", "lcov", "json-summary"],
            thresholds: {
                lines: 95,
                statements: 95,
                functions: 95,
                branches: 90,
            },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    include: ["test/unit/**/*.spec.ts"],
                    setupFiles: ["test/setup/unit.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "functional",
                    include: ["test/functional/**/*.spec.ts"],
                    setupFiles: ["test/setup/unit.ts"],
                },
            },
            {
                extends: true,
                test: { name: "e2e", include: ["test/e2e/**/*.spec.ts"], ...integrationSetup },
            },
            {
                extends: true,
                test: { name: "latency", include: ["test/latency/**/*.spec.ts"], ...integrationSetup },
            },
        ],
    },
});
