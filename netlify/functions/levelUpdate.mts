import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";
import moment from 'moment-timezone';
import tzlookup from 'tz-lookup';

// Helper function to extract and round time
const extractAndRoundTime = (transmitTime: string): moment.Moment => {
    const time = moment.utc(transmitTime, 'YY-MM-DD HH:mm:ss');
    if (time.minute() >= 30) {
        time.add(1, 'hour');
    }
    time.minute(0).second(0).millisecond(0);
    return time;
};

// Helper function to create an array of times
const createTimesArray = (startTime: moment.Moment, length: number, timezone: string): string[] => {
    const times = Array.from({ length }, (_, i) => {
        const time = moment(startTime).tz(timezone).add(i, 'hours');
        return time.format('HH:mm');
    });
    return times.reverse();
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
            acc[time] = `${decodedData[index]}cm`;
            return acc;
        }, {} as Record<string, string>);

        await levels.setJSON("latest", levelData);
        console.log(levelData);
        return new Response(null, { status: 200 });
    }
    return new Response("Method Not Allowed");
};