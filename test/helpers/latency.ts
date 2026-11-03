import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

export interface LatencyStats {
    name: string;
    iterations: number;
    p50: number;
    p95: number;
    max: number;
    budgetP95: number;
}

const budgetFactor = Number(process.env.LATENCY_BUDGET_FACTOR ?? "1") || 1;
const report: LatencyStats[] = [];

function percentile(sorted: number[], p: number): number {
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, index)] as number;
}

export async function measure(
    name: string,
    budgetP95Ms: number,
    action: (iteration: number) => Promise<void>,
    { iterations = 40, warmup = 5 } = {},
): Promise<LatencyStats> {
    for (let i = 0; i < warmup; i++) await action(-1 - i);

    const durations: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await action(i);
        durations.push(performance.now() - start);
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const round = (value: number) => Math.round(value * 10) / 10;
    const stats: LatencyStats = {
        name,
        iterations,
        p50: round(percentile(sorted, 50)),
        p95: round(percentile(sorted, 95)),
        max: round(sorted[sorted.length - 1] as number),
        budgetP95: budgetP95Ms * budgetFactor,
    };
    report.push(stats);
    return stats;
}

export function formatLatencyReport(): string {
    const header = "| Route | n | p50 (ms) | p95 (ms) | max (ms) | budget p95 (ms) |\n|---|---|---|---|---|---|";
    const rows = report.map(({ name, iterations, p50, p95, max, budgetP95 }) => `| ${name} | ${iterations} | ${p50} | ${p95} | ${max} | ${budgetP95} |`);
    return [header, ...rows].join("\n");
}

export function printLatencyReport(): void {
    if (report.length === 0) return;
    const markdown = formatLatencyReport();
    process.stdout.write(`\nLatency report\n${markdown}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Latency report\n\n${markdown}\n`);
}
