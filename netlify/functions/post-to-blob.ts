import { Handler } from '@netlify/functions';
import qs from 'qs';
import { getStore } from "@netlify/blobs";

const handler: Handler = async (event, context) => {
    if (event.httpMethod === 'POST') {

        // Parse the URL-encoded form data
        const formData = qs.parse(event.body);

        // Log the parsed form data
        console.log("Form values:", formData.data);
        const levels = getStore("levels");
        // await levels.setJSON("nails", { type: "common", finish: "bright" });
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Post received" }),
        };
    }
    console.log("I got a get");
    return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
    };
};

export { handler };
