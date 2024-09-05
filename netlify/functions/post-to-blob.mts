import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        // Parse the URL-encoded form data
        const formData = qs.parse(await req.text());
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