import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
    if (req.method === 'POST') {
        return new Response(null, { status: 200 });
    }
    return new Response("Method Not Allowed");
};

export const config: Config = {
    path: "/historicalupdate"
};