import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import moment from 'moment-timezone';

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        const url = new URL(req.url);
        const queryParams = new URLSearchParams(url.search);
        const river = queryParams.keys().next().value;

        if (!river) {
            return new Response("River parameter required", { status: 400 });
        }

        // Check for internal call authentication
        const internalToken = req.headers.get('x-internal-token');
        const expectedToken = Netlify.env.get('INTERNAL_FUNCTION_TOKEN');

        if (!internalToken || internalToken !== expectedToken) {
            return new Response("Unauthorized", { status: 401 });
        }

        try {
            await updateHistoricalData(river);
            console.log(`Updated historical data for ${river}`);
            return new Response(null, { status: 200 });
        } catch (error) {
            console.error(`Failed to update historical data for ${river}:`, error);
            return new Response("Internal Server Error", { status: 500 });
        }
    }
    return new Response("Method Not Allowed", { status: 405 });
};

async function updateHistoricalData(river: string) {
    const levels = getStore(river);
    const historicalStore = getStore(river + "-historical");

    // Get latest data
    const latestData = await levels.getWithMetadata("latest");
    if (!latestData) return;

    const latest = JSON.parse(latestData.data);

    // Use the transmit time from the data, not current time
    const transmitTime = latest.metadata?.transmitTime?.utc || latest.metadata?.transmitTime;
    let dataDate;

    if (transmitTime) {
        // Parse the transmit time to get the correct date
        dataDate = moment.utc(transmitTime, [
            'YYYY-MM-DDTHH:mm:ssZ',  // ISO format
            'YY-MM-DD HH:mm:ss',     // Format like 25-08-29 02:06:00
            moment.ISO_8601
        ], true);
    } else {
        // Fallback to current time if no transmit time available
        dataDate = moment();
    }

    const year = dataDate.format('YYYY');
    const month = dataDate.format('MM');
    const date = dataDate.format('YYYY-MM-DD');

    // Get existing historical data for the year
    let historicalData;
    try {
        const existing = await historicalStore.get(year);
        historicalData = existing ? JSON.parse(existing) : createEmptyYearStructure(river, year);
    } catch {
        historicalData = createEmptyYearStructure(river, year);
    }

    // Add current data if it exists in latest readings
    if (latest.levels && Object.keys(latest.levels).length > 0) {
        if (!historicalData.data[year]) {
            historicalData.data[year] = {};
        }
        if (!historicalData.data[year][month]) {
            historicalData.data[year][month] = {};
        }

        // Convert readings to numbers and merge with existing daily data
        const newReadings: Record<string, number> = {};
        for (const [time, level] of Object.entries(latest.levels)) {
            // Skip blank, null, or invalid readings
            if (!level || level === '' || level === null || level === undefined) {
                console.warn(`Skipping blank reading for time ${time}`);
                continue;
            }

            const levelStr = String(level);
            const numericValue = parseInt(levelStr.replace('cm', ''));

            // Only add if we get a valid number
            if (!isNaN(numericValue)) {
                newReadings[time] = numericValue;
            } else {
                console.warn(`Invalid reading for time ${time}: ${level}`);
            }
        }

        // Get existing readings for this date or create empty object
        const existingReadings = historicalData.data[year][month][date] || {};

        // Merge new readings with existing ones (new readings will overwrite if same time)
        const mergedReadings = { ...existingReadings, ...newReadings };

        // Calculate how many new readings were added
        const newReadingsCount = Object.keys(newReadings).filter(time => !existingReadings[time]).length;

        historicalData.data[year][month][date] = mergedReadings;
        historicalData.metadata.totalReadings += newReadingsCount;
        historicalData.metadata.lastUpdated = moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC';
    }

    // Sort everything chronologically: years, months, dates
    const sortedYears: Record<string, any> = {};
    Object.keys(historicalData.data)
        .sort()
        .forEach(y => {
            const sortedMonths: Record<string, any> = {};
            Object.keys(historicalData.data[y])
                .sort((a, b) => parseInt(a) - parseInt(b))
                .forEach(m => {
                    const sortedDates: Record<string, any> = {};
                    Object.keys(historicalData.data[y][m])
                        .sort()
                        .forEach(d => {
                            sortedDates[d] = historicalData.data[y][m][d];
                        });
                    sortedMonths[m] = sortedDates;
                });
            sortedYears[y] = sortedMonths;
        });
    historicalData.data = sortedYears;

    // Save updated historical data
    await historicalStore.setJSON(year, historicalData);
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

export const config: Config = {
    path: "/historicalupdate"
};