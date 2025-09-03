import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    const url = new URL(req.url);
    const queryParams = new URLSearchParams(url.search);
    const river = queryParams.keys().next().value;

    if (!river) {
        return new Response("River parameter required", { status: 400 });
    }

    const historicalStore = getStore(river + "-historical");

    // Check for year parameter
    const yearParam = queryParams.get('year');
    const yearsParam = queryParams.get('years');

    let yearsToFetch: string[] = [];

    if (yearParam) {
        // Single year: /historicallevels?wigwam&year=2024
        yearsToFetch = [yearParam];
    } else if (yearsParam) {
        // Multiple years: /historicallevels?wigwam&years=2023,2024,2025
        yearsToFetch = yearsParam.split(',').map(y => y.trim());
    } else {
        // All years: /historicallevels?wigwam
        const currentYear = new Date().getFullYear();
        const startYear = 2025;
        const endYear = currentYear + 10;
        yearsToFetch = Array.from({ length: endYear - startYear + 1 }, (_, i) =>
            (startYear + i).toString()
        );
    }

    const allHistoricalData = {
        metadata: {
            river: river,
            totalYears: 0,
            availableYears: [] as string[],
            requestedYears: yearsToFetch
        },
        data: {} as Record<string, any>
    };

    for (const yearStr of yearsToFetch) {
        try {
            const yearData = await historicalStore.get(yearStr);
            if (yearData) {
                const parsedData = JSON.parse(yearData);
                allHistoricalData.data[yearStr] = parsedData.data[yearStr];
                allHistoricalData.metadata.availableYears.push(yearStr);
                allHistoricalData.metadata.totalYears++;
            }
        } catch (error) {
            // Year doesn't exist, continue to next year
            continue;
        }
    }

    if (allHistoricalData.metadata.totalYears === 0) {
        return new Response(JSON.stringify({
            message: "No historical data found",
            requestedYears: yearsToFetch
        }), {
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify(allHistoricalData), {
        headers: { "Content-Type": "application/json" }
    });
};

export const config: Config = {
    path: "/historicallevels"
};