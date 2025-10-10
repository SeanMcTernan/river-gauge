import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import moment from 'moment-timezone';

/**
 * Bulk Historical Data Update Function
 * 
 * Accepts JSON payload to update historical river data in bulk
 * 
 * Endpoint: POST /bulkhistoricalupdate?{river}
 * 
 * Expected JSON payload format (from 2025.json):
 * {
 *   "metadata": {
 *     "river": "wigwam",
 *     "year": 2025,
 *     "timezone": "UTC",
 *     "units": "cm",
 *     "totalReadings": 763,
 *     "lastUpdated": "2025-10-06 14:01:48 UTC"
 *   },
 *   "data": {
 *     "2025": {
 *       "10": {
 *         "2025-10-01": {
 *           "00:00": 35,
 *           "01:00": 36
 *         }
 *       }
 *     }
 *   },
 *   "merge": false // optional: true to merge with existing data, false to replace (default: false)
 * }
 * 
 * Authentication: Requires x-internal-token header
 */

export default async (req: Request, context: Context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
        });
    }

    const url = new URL(req.url);
    const queryParams = new URLSearchParams(url.search);
    const river = queryParams.keys().next().value;

    if (!river) {
        return new Response(JSON.stringify({ error: "River parameter required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Check for authentication
    const internalToken = req.headers.get('x-internal-token');
    const expectedToken = Netlify.env.get('INTERNAL_FUNCTION_TOKEN');

    if (!internalToken || internalToken !== expectedToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const payload = await req.json();

        if (!payload.data || typeof payload.data !== 'object') {
            return new Response(JSON.stringify({
                error: "Invalid payload: 'data' field required"
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const merge = payload.merge === true; // default to false (replace)
        const result = await bulkUpdateHistoricalData(river, payload.data, merge);

        return new Response(JSON.stringify({
            success: true,
            river: river,
            yearsUpdated: result.yearsUpdated,
            totalReadingsAdded: result.totalReadingsAdded,
            mode: merge ? "merge" : "replace"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error(`Failed to bulk update historical data for ${river}:`, error);
        return new Response(JSON.stringify({
            error: "Internal Server Error",
            message: error.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};

async function bulkUpdateHistoricalData(
    river: string,
    incomingData: Record<string, any>,
    merge: boolean
): Promise<{ yearsUpdated: string[], totalReadingsAdded: number }> {
    const historicalStore = getStore(river + "-historical");
    const yearsUpdated: string[] = [];
    let totalReadingsAdded = 0;

    // Process each year in the incoming data
    for (const year in incomingData) {
        if (!incomingData[year] || typeof incomingData[year] !== 'object') {
            console.warn(`Skipping invalid year data: ${year}`);
            continue;
        }

        let yearData;

        if (merge) {
            // Merge mode: Get existing data and merge
            try {
                const existing = await historicalStore.get(year);
                yearData = existing ? JSON.parse(existing) : createEmptyYearStructure(river, year);
            } catch {
                yearData = createEmptyYearStructure(river, year);
            }
        } else {
            // Replace mode: Start fresh
            yearData = createEmptyYearStructure(river, year);
        }

        // Process months
        for (const month in incomingData[year]) {
            if (!incomingData[year][month] || typeof incomingData[year][month] !== 'object') {
                console.warn(`Skipping invalid month data: ${year}-${month}`);
                continue;
            }

            // Initialize month if it doesn't exist
            if (!yearData.data[year]) {
                yearData.data[year] = {};
            }
            if (!yearData.data[year][month]) {
                yearData.data[year][month] = {};
            }

            // Process dates
            for (const date in incomingData[year][month]) {
                const hourlyReadings = incomingData[year][month][date];

                if (!hourlyReadings || typeof hourlyReadings !== 'object') {
                    console.warn(`Skipping invalid date data: ${date}`);
                    continue;
                }

                // Validate and convert readings to numbers
                const validReadings: Record<string, number> = {};
                for (const [time, level] of Object.entries(hourlyReadings)) {
                    if (level === null || level === undefined || level === '') {
                        console.warn(`Skipping blank reading for ${date} ${time}`);
                        continue;
                    }

                    const numericValue = typeof level === 'number'
                        ? level
                        : parseInt(String(level).replace('cm', ''));

                    if (!isNaN(numericValue)) {
                        validReadings[time] = numericValue;
                    } else {
                        console.warn(`Invalid reading for ${date} ${time}: ${level}`);
                    }
                }

                if (Object.keys(validReadings).length === 0) {
                    continue;
                }

                // Merge or replace readings for this date
                const existingReadings = yearData.data[year][month][date] || {};

                if (merge) {
                    // Count only new readings
                    const newReadings = Object.keys(validReadings).filter(
                        time => !existingReadings[time]
                    ).length;
                    totalReadingsAdded += newReadings;

                    // Merge: new readings overwrite existing ones
                    yearData.data[year][month][date] = {
                        ...existingReadings,
                        ...validReadings
                    };
                } else {
                    // Replace mode: count all readings
                    totalReadingsAdded += Object.keys(validReadings).length;
                    yearData.data[year][month][date] = validReadings;
                }
            }
        }

        // Update metadata
        yearData.metadata.totalReadings = countTotalReadings(yearData.data[year]);
        yearData.metadata.lastUpdated = moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC';

        // Sort everything chronologically: years, months, dates
        const sortedYears: Record<string, any> = {};
        Object.keys(yearData.data)
            .sort()
            .forEach(y => {
                const sortedMonths: Record<string, any> = {};
                Object.keys(yearData.data[y])
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .forEach(m => {
                        const sortedDates: Record<string, any> = {};
                        Object.keys(yearData.data[y][m])
                            .sort()
                            .forEach(d => {
                                sortedDates[d] = yearData.data[y][m][d];
                            });
                        sortedMonths[m] = sortedDates;
                    });
                sortedYears[y] = sortedMonths;
            });
        yearData.data = sortedYears;

        // Save the year data
        await historicalStore.setJSON(year, yearData);
        yearsUpdated.push(year);

        console.log(`Updated ${year} for ${river}: ${yearData.metadata.totalReadings} total readings`);
    }

    return { yearsUpdated, totalReadingsAdded };
}

function createEmptyYearStructure(river: string, year: string) {
    return {
        metadata: {
            river: river,
            year: parseInt(year),
            timezone: "UTC",
            units: "cm",
            totalReadings: 0,
            lastUpdated: moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC'
        },
        data: {
            [year]: {}
        }
    };
}

function countTotalReadings(yearData: Record<string, any>): number {
    let count = 0;
    for (const month in yearData) {
        for (const date in yearData[month]) {
            count += Object.keys(yearData[month][date]).length;
        }
    }
    return count;
}

export const config: Config = {
    path: "/bulkhistoricalupdate"
};
