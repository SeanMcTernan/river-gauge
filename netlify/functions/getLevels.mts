import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    const url = new URL(req.url);
    const queryParams = new URLSearchParams(url.search);
    const river = queryParams.keys().next().value;
    const levels = getStore(river);
    const latest = await levels.get("latest");
    return new Response(latest);
};