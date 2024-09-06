import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";
import { stat } from "fs";

// Helper function to extract and round time
const extractAndRoundTime = (transmitTime: string): Date => {
    const timeOnly = transmitTime.split(' ')[1];
    const [hours, minutes, seconds] = timeOnly.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, seconds);

    if (date.getMinutes() >= 30) {
        date.setHours(date.getHours() + 1);
    }
    date.setMinutes(0, 0, 0);
    return date;
};

// Helper function to create an array of times
const createTimesArray = (startDate: Date, length: number): string[] => {
    return Array.from({ length }, (_, i) => {
        const time = new Date(startDate);
        time.setHours(time.getHours() - (length - 1 - i));
        return time.toTimeString().slice(0, 5); // Format as HH:MM
    });
};

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        const formData = qs.parse(await req.text());
        console.log(formData);
        const transmitTime = formData.transmit_time;
        const roundedDate = extractAndRoundTime(transmitTime);

        const hexData = formData.data;
        const decodedData: number[] = JSON.parse(Buffer.from(hexData, 'hex').toString());

        const levels = getStore("levels");
        const times = createTimesArray(roundedDate, 12);

        const levelData = times.reduce((acc, time, index) => {
            acc[time] = `${decodedData[index]}cm`;
            return acc;
        }, {} as Record<string, string>);

        await levels.setJSON("latest", levelData);
        console.log(levelData);
        return
    }
    return new Response("Method Not Allowed");
};