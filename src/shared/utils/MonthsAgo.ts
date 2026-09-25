export class MonthsAgo {
    public static monthsAgo(months: number): Date {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return d;
    }
}