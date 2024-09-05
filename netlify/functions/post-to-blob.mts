import type { Context } from "@netlify/functions";
import qs from 'qs';
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        // Parse the URL-encoded form data
        const formData = qs.parse(await req.text());
        console.log("Form values:", formData);
        const levels = getStore("levels");
        await levels.setJSON("latest", { time: "14:00", level: "15cm" });
        return new Response("Post Received");
    }
    return new Response("Method Not Allowed");
};