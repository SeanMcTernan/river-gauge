import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        // Parse the URL-encoded form data
        const formData = qs.parse(await req.text());
        const transmitTime = formData.transmit_time;
        const timeOnly = transmitTime.split(' ')[1]; // Extract the time part
        console.log(timeOnly);

        // Parse the time into a Date object
        const [hours, minutes, seconds] = timeOnly.split(':').map(Number);
        let date = new Date();
        date.setHours(hours, minutes, seconds);

        // Round the time to the nearest hour
        if (date.getMinutes() >= 30) {
            date.setHours(date.getHours() + 1);
        }
        date.setMinutes(0);
        date.setSeconds(0);

        // Format the rounded time back into a string
        const roundedTime = date.toTimeString().split(' ')[0];
        console.log(roundedTime);

        const hexData = formData.data;
        const decodedData: number[] = JSON.parse(Buffer.from(hexData, 'hex').toString());
        console.log(decodedData);
        const levels = getStore("levels");

        // Create an array of times from 08:00 to 20:00
        const times = Array.from({ length: 12 }, (_, i) => {
            const hour = 8 + i;
            return `${hour.toString().padStart(2, '0')}:00`;
        });

        // Create an object with times as keys and decodedData as values
        const levelData = times.reduce((acc, time, index) => {
            acc[time] = `${decodedData[index]}cm`;
            return acc;
        }, {} as Record<string, string>);

        await levels.setJSON("latest", levelData);
        return new Response("Post Received");
    }
    return new Response("Method Not Allowed");
};