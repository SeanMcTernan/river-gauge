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

    // Parse transmit time to determine the date range of readings
    const transmitTime = latest.metadata?.transmitTime?.utc || latest.metadata?.transmitTime;
    if (!transmitTime) {
        console.warn('No transmit time found in metadata');
        return;
    }

    const transmitMoment = moment.utc(transmitTime, [
        'YYYY-MM-DDTHH:mm:ssZ',
        'YY-MM-DD HH:mm:ss',
        moment.ISO_8601
    ], true);

    if (!transmitMoment.isValid()) {
        console.error(`Invalid transmit time: ${transmitTime}`);
        return;
    }

    // Round to nearest hour (same logic as levelUpdate)
    if (transmitMoment.minute() >= 30) {
        transmitMoment.add(1, 'hour');
    }
    transmitMoment.minute(0).second(0).millisecond(0);

    // Cache for historical data across potentially multiple years
    const yearDataCache: Record<string, any> = {};

    // Add current data if it exists in latest readings
    if (latest.levels && Object.keys(latest.levels).length > 0) {
        // Group readings by their actual date (not transmit date)
        const readingsByDate: Record<string, Record<string, number>> = {};

        // The times array from levelUpdate goes backwards from transmit time
        // Keys are just "HH:mm" format - MUST preserve insertion order, not sort
        // because times may wrap around midnight (e.g., 22:00, 23:00, 00:00, 01:00)
        const timeKeys = Object.keys(latest.levels);

        for (let i = 0; i < timeKeys.length; i++) {
            const timeKey = timeKeys[i];
            const level = latest.levels[timeKey];

            // Skip blank, null, or invalid readings
            if (!level || level === '' || level === null || level === undefined) {
                console.warn(`Skipping blank reading for time ${timeKey}`);
                continue;
            }

            const levelStr = String(level);
            const numericValue = parseInt(levelStr.replace('cm', ''));

            // Only add if we get a valid number
            if (!isNaN(numericValue)) {
                // Calculate actual datetime: readings go back (length-1) to 0 hours from transmit
                const hoursBack = timeKeys.length - 1 - i;
                const readingTime = transmitMoment.clone().subtract(hoursBack, 'hours');
                const dateKey = readingTime.format('YYYY-MM-DD');
                const hourKey = readingTime.format('HH:mm');

                if (!readingsByDate[dateKey]) {
                    readingsByDate[dateKey] = {};
                }
                readingsByDate[dateKey][hourKey] = numericValue;
            } else {
                console.warn(`Invalid reading for time ${timeKey}: ${level}`);
            }
        }

        // Process each date's readings
        for (const [dateKey, readings] of Object.entries(readingsByDate)) {
            const dateMoment = moment.utc(dateKey, 'YYYY-MM-DD');
            const year = dateMoment.format('YYYY');
            const month = dateMoment.format('MM');

            // Get or load historical data for this year
            if (!yearDataCache[year]) {
                try {
                    const existing = await historicalStore.get(year);
                    yearDataCache[year] = existing ? JSON.parse(existing) : createEmptyYearStructure(river, year);
                } catch {
                    yearDataCache[year] = createEmptyYearStructure(river, year);
                }
            }

            const historicalData = yearDataCache[year];

            // Ensure data structure exists
            if (!historicalData.data[year]) {
                historicalData.data[year] = {};
            }
            if (!historicalData.data[year][month]) {
                historicalData.data[year][month] = {};
            }

            // Get existing readings for this date or create empty object
            const existingReadings = historicalData.data[year][month][dateKey] || {};

            // Merge new readings with existing ones
            const mergedReadings = { ...existingReadings, ...readings };

            // Calculate how many new readings were added
            const newReadingsCount = Object.keys(readings).filter(time => !existingReadings[time]).length;

            historicalData.data[year][month][dateKey] = mergedReadings;
            historicalData.metadata.totalReadings += newReadingsCount;
            historicalData.metadata.lastUpdated = moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC';
        }
    }

    // Sort and save all affected years
    for (const [year, historicalData] of Object.entries(yearDataCache)) {
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

        // Save updated historical data for this year
        await historicalStore.setJSON(year, historicalData);
    }
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