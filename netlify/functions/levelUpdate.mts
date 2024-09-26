import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";
import moment from 'moment-timezone';

// Helper function to extract and round time
const extractAndRoundTime = (transmitTime: string): Date => {
    const timeOnly = transmitTime.split(' ')[1];
    const [hours, minutes, seconds] = timeOnly.split(':').map(Number);
    const date = new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds));

    if (date.getUTCMinutes() >= 30) {
        date.setUTCHours(date.getUTCHours() + 1);
    }
    date.setUTCMinutes(0, 0, 0);
    return date;
};


// Helper function to create an array of times
const createTimesArray = (startDate: Date, length: number, timezone: string): string[] => {
    console.log(`The time given to the array is ${startDate}`);
    return Array.from({ length }, (_, i) => {
        const time = moment(startDate).tz(timezone).add(i, 'hours');
        console.log(`The times given to the array is ${time}`);
        return time.format('HH:mm');
    });
};

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        const formData = qs.parse(await req.text());
        console.log(formData);
        const transmitTime = formData.transmit_time;
        const latitude = parseFloat(formData.iridium_latitude);
        const longitude = parseFloat(formData.iridium_longitude);
        const roundedDate = extractAndRoundTime(transmitTime);
        const hexData = formData.data;
        const decodedData: number[] = JSON.parse(Buffer.from(hexData, 'hex').toString());

        const levels = getStore("levels");
        const timezone = moment.tz.guess(latitude, longitude);

        const times = createTimesArray(roundedDate, 12, timezone);

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
