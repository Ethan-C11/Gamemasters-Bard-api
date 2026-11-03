const DEFAULT_INACTIVITY_MONTH_LIMIT = 24;

export function getInactivityMonthLimit(): number {
    const limit = Number(process.env.INACTIVITY_MONTH_LIMIT);
    return Number.isInteger(limit) && limit > 1 ? limit : DEFAULT_INACTIVITY_MONTH_LIMIT;
}
