import type { Config, Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";
import moment from 'moment-timezone';
import tzlookup from 'tz-lookup';

// Read the zero environment variable and convert to number
const zero = Number(process.env.zero);
console.log('Zero value from environment:', zero);

// Helper function to extract and round time
const extractAndRoundTime = (transmitTime: string): moment.Moment => {
    // Handle multiple possible date formats
    const formats = [
        'YYYY-MM-DDTHH:mm:ssZ',  // ISO format like 2025-08-29T14:02:53Z
        'YY-MM-DD HH:mm:ss',     // Format like 25-08-30 02:00:50
        moment.ISO_8601          // Standard ISO format
    ];

    const time = moment.utc(transmitTime, formats, true);

    if (!time.isValid()) {
        throw new Error(`Invalid transmit time format: ${transmitTime}`);
    }

    if (time.minute() >= 30) {
        time.add(1, 'hour');
    }
    time.minute(0).second(0).millisecond(0);
    return time;
};

// Helper function to create an array of times going backwards from the start time
const createTimesArray = (startTime: moment.Moment, length: number, timezone: string): string[] => {
    const times = Array.from({ length }, (_, i) => {
        const time = moment(startTime).tz(timezone).subtract(length - 1 - i, 'hours');
        return time.format('HH:mm');
    });
    return times;
};

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        //Extract the river name from the query parameters
        const url = new URL(req.url);
        const queryParams = new URLSearchParams(url.search);
        const river = queryParams.keys().next().value;
        //Extract the form data from the payload
        const formData = qs.parse(await req.text());
        console.log(formData);
        // Pull Lat/Long to determine local time of the transmit time 
        const transmitTime = formData.transmit_time;
        const latitude = parseFloat(formData.iridium_latitude);
        const longitude = parseFloat(formData.iridium_longitude);
        const timezone = tzlookup(latitude, longitude);
        // Round time to nearest hour and create a list of times
        const roundedTime = extractAndRoundTime(transmitTime);
        const times = createTimesArray(roundedTime, 12, timezone);
        // Parse the hex endoded data into an array of numbers
        const hexData = formData.data;
        const decodedData: number[] = JSON.parse(Buffer.from(hexData, 'hex').toString());
        //Get the associated levels Netlify Blob Store
        const levels = getStore(river);

        const levelData = times.reduce((acc, time, index) => {
            const level = zero - decodedData[index];
            acc[time] = `${level}cm`;
            return acc;
        }, {} as Record<string, string>);

        const localTransmitTime = roundedTime.clone().tz(timezone);

        const blobData = {
            levels: levelData,
            metadata: {
                transmitTime: {
                    utc: transmitTime,
                    local: localTransmitTime.format('YYYY-MM-DD HH:mm:ss'),
                    timezone: timezone
                },
                location: {
                    latitude: latitude,
                    longitude: longitude
                },
                lastUpdated: moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC'
            }
        };

        await levels.setJSON("latest", blobData);

        // Trigger historical update
        try {
            const internalToken = Netlify.env.get('INTERNAL_FUNCTION_TOKEN');
            if (!internalToken) {
                console.error('INTERNAL_FUNCTION_TOKEN environment variable not set');
                return new Response(null, { status: 200 }); // Continue without historical update
            }

            const historicalUpdateUrl = `${new URL(req.url).origin}/historicalupdate?${river}`;
            await fetch(historicalUpdateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-token': internalToken
                }
            });
            console.log(`Historical update triggered for ${river}`);
        } catch (error) {
            console.error(`Failed to trigger historical update for ${river}:`, error);
            // Don't fail the main request if historical update fails
        }

        return new Response(null, { status: 200 });
    }
    return new Response("Method Not Allowed");
};

export const config: Config = {
    path: "/levelupdate"
};