import express, { Request, Response } from 'express';
import { CallsApi, Configuration } from 'bandwidth-sdk';
import {Endpoint} from "./types";

const app = express();
app.use(express.json()); // Add this line
const PORT = 5000;
const PROD_VOICE_URL = "https://voice.bandwidth.com/api/v2";


function getEnvVars() {
    const requiredVars = [
        'HTTP_BASE_URL',
        'VOICE_URL',
        'CALLBACK_BASE_URL',
        'ACCOUNT_ID',
        'APPLICATION_ID',
        'BW_PASSWORD', // Only required if using BW_USERNAME
        'BW_ID_URL',
        'FROM_NUMBER',
    ];
    const env = process.env;
    // Check for authentication: either username/password or client id/secret
    const hasUserPass = !!env.BW_USERNAME && !!env.BW_PASSWORD;
    const hasClientCreds = !!env.BW_ID_CLIENT_ID && !!env.BW_ID_CLIENT_SECRET;
    if (!hasUserPass && !hasClientCreds) {
        throw new Error('You must set either BW_USERNAME and BW_PASSWORD, or BW_ID_CLIENT_ID and BW_ID_CLIENT_SECRET in your environment.');
    }
    // Check all other required vars
    for (const v of requiredVars) {
        if (!env[v]) {
            // BW_PASSWORD is only required if using BW_USERNAME
            if (v === 'BW_PASSWORD' && !hasUserPass) continue;
            if (v === 'BW_ID_HOSTNAME') continue; // has default
            throw new Error(`Missing required environment variable: ${v}`);
        }
    }
    return {
        HTTP_BASE_URL: (env.HTTP_BASE_URL || "https://api.bandwidth.com/v2") as string,
        VOICE_URL: (env.VOICE_URL || PROD_VOICE_URL) as string,
        CALLBACK_BASE_URL: env.CALLBACK_BASE_URL as string,
        ACCOUNT_ID: env.ACCOUNT_ID as string,
        APPLICATION_ID: env.APPLICATION_ID as string,
        BW_USERNAME: env.BW_USERNAME as string | undefined,
        BW_PASSWORD: env.BW_PASSWORD as string | undefined,
        BW_ID_CLIENT_ID: env.BW_ID_CLIENT_ID as string | undefined,
        BW_ID_CLIENT_SECRET: env.BW_ID_CLIENT_SECRET as string | undefined,
        BW_ID_URL: (env.BW_ID_URL || "https://id.bandwidth.com") as string,
        FROM_NUMBER: env.FROM_NUMBER as string,
    };
}

const {
    HTTP_BASE_URL,
    VOICE_URL,
    CALLBACK_BASE_URL,
    ACCOUNT_ID,
    APPLICATION_ID,
    BW_USERNAME,
    BW_PASSWORD,
    BW_ID_CLIENT_ID,
    BW_ID_CLIENT_SECRET,
    BW_ID_URL: BW_ID_HOSTNAME,
    FROM_NUMBER
} = getEnvVars();

let endpointAvailableMap = new Map<string, boolean>(); // Endpoint ID -> Available Status
let endpointCallIdMap = new Map<string, string>(); // Call ID -> Endpoint ID

let idToken: string = "";
let idTokenExpiration: number = 0;
async function getAuthToken(username: string, password: string): Promise<string> {
    // Check if we have a valid token and it's not expired'
    if (!idToken || Date.now() >= idTokenExpiration) {
        // Fetch a new token
        console.log("Fetching new auth token");
        const response = await fetch(`${BW_ID_HOSTNAME}/api/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(username + ':' + password),
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
            })
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch auth token: ${response.status} ${await response.text()}`);
        }
        const authData = await response.json();
        idToken = authData?.access_token;
        idTokenExpiration = Date.now() + ((authData?.expires_in - 10) * 1000);
    }
    return idToken;
}


async function placeCall(endpointId: string, toNumber: string, fromNumber: string) {
    if (endpointAvailableMap.has(endpointId)) {
        // Initialize Bandwidth SDK CallsApi with custom base URL and appropriate authentication
        let configuration: Configuration;
        if (BW_USERNAME && BW_PASSWORD) {
            // Use basic authentication
            configuration = new Configuration({
                username: BW_USERNAME,
                password: BW_PASSWORD,
            });
        } else {
            // Use OAuth2 client credentials
            configuration = new Configuration({
                clientId: BW_ID_CLIENT_ID,
                clientSecret: BW_ID_CLIENT_SECRET,
            });
        }

        if (VOICE_URL !== PROD_VOICE_URL) {
            console.log(`Using custom voice URL: ${VOICE_URL}`);
            configuration.basePath = VOICE_URL;
        }

        const callsApi = new CallsApi(configuration);

        // Place outbound call using Bandwidth SDK
        const body = {
            applicationId: APPLICATION_ID,
            to: toNumber,
            from: fromNumber,
            answerUrl: `${CALLBACK_BASE_URL}/api/callbacks/calls/initiate`,
        };
        let response = await callsApi.createCall(ACCOUNT_ID, body);
        let callId = response.data.callId;
        console.log(`Placed outbound call ${callId} from endpoint ${endpointId} to ${toNumber}`);
        // Map the newly created outbound call id to the endpoint that requested it
        endpointCallIdMap.set(callId, endpointId)
        return callId;
    } else {
        // Throw error
        throw new Error("Endpoint is not available")
    }
}

/**
 * Find the first available endpoint to connect to a call and claim it.
 * @returns Endpoint ID if an available endpoint is found, empty string otherwise.
 */
function claimFirstAvailableEndpoint() {
    for (const [endpointId, available] of endpointAvailableMap.entries()) {
        if (available) {
            claimEndpoint(endpointId)
            return endpointId;
        }
    }
    return "";
}

/**
 * Claim an endpoint from the pool of available endpoints.
 * @param endpointId
 */
function claimEndpoint(endpointId: string) {
    if (endpointAvailableMap.has(endpointId)) {
        console.log(`Claiming endpoint from the pool ${endpointId}`)
        endpointAvailableMap.set(endpointId, false);
    }
}

/**
 * Release an endpoint back to the pool of available endpoints.
 * @param endpointId
 */
function releaseEndpoint(endpointId: string) {
    if (endpointAvailableMap.has(endpointId)) {
        console.log(`Releasing endpoint to the pool ${endpointId}`)
        endpointAvailableMap.set(endpointId, true);
    }
}

/**
 * Handle a call disconnect event.
 * @param callId
 */
function handleCallDisconnect(callId: string) {
    let endpointId = endpointCallIdMap.get(callId);
    if (endpointId) {
        releaseEndpoint(endpointId);
    }
    endpointCallIdMap.delete(callId);
}

/**
 * Process an inbound call and return the appropriate response XML.
 * @param callId
 */
function processInboundCall(callId: string): string {
    let requestingEndpointId = endpointCallIdMap.get(callId);
    if (!requestingEndpointId) {
        // We have to recollection of this call, we should find the first available endpoint to connect to it
        let endpointId = claimFirstAvailableEndpoint();
        if (endpointId === "") {
            // No available endpoints, keep the call waiting using some on-hold sentences. This should be on-hold music but this sample does not have that.
            return `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                       <SpeakSentence voice="julie">
                          You are on-hold. Please wait for an available endpoint to connect to this call.
                       </SpeakSentence>
                       <Redirect redirectUrl="${CALLBACK_BASE_URL}/api/callbacks/calls/status"/>
                    </Response>`
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <SpeakSentence voice="julie">
                          Connecting
                    </SpeakSentence>
                    <Connect>
                        <Endpoint>${endpointId}</Endpoint>
                    </Connect>
                </Response>`
    } else {
        return `<?xml version="1.0" encoding="UTF-8"?>
                <Response>
                    <SpeakSentence voice="julie">
                          Connecting
                    </SpeakSentence>
                    <Connect>
                        <Endpoint>${requestingEndpointId}</Endpoint>
                    </Connect>
                </Response>`
    }
}

app.post('/api/callbacks/calls/initiate', async (req: Request, res: Response) => {
    let callId = req.body.callId
    const xmlResponse = processInboundCall(callId)
    console.log(`Initiated call with ID: ${callId} (${xmlResponse})`)
    res.set('Content-Type', 'application/xml');
    res.send(xmlResponse);
});

app.post('/api/callbacks/calls/status', async (req: Request, res: Response) => {
    let callId = req.body.callId
    let eventType = req.body.eventType
    switch (eventType) {
        case "disconnect":
            console.log(`Call disconnected with ID: ${callId}`);
            handleCallDisconnect(callId);
            res.sendStatus(200);
            break;
        case "redirect":
        default:
            console.log(`Call status update for call ID: ${callId} ${eventType}`);
            const xmlResponse = processInboundCall(callId)
            res.set('Content-Type', 'application/xml');
            res.send(xmlResponse);
            break;
    }
});

app.post('/api/callbacks/endpoints/status', async (req: Request, res: Response) => {
    console.log(`Endpoint status callback received:`, JSON.stringify(req.body, null, 2));
    let endpointId = req.body.endpointId;
    let event = req.body.event;
    let toType = req.body.toType;
    let to = req.body.to;
    switch (event) {
        case "endpointIneligible":
            claimEndpoint(endpointId);
            break;
        case "endpointEligible":
            releaseEndpoint(endpointId);
            break;
        case "outboundConnectionRequest":
            // Validate the connection request and place the call if it's valid'
            if (toType === "PHONE_NUMBER") {
                console.log(`Outbound call request received for endpoint ${endpointId} to ${to}`);
                if (!to.startsWith("+")) {
                    to = `+${to}`;
                }
                await placeCall(endpointId, to, FROM_NUMBER)
            }
            break;
    }

    res.sendStatus(200);
});


app.post('/api/endpoint', async (req: Request, res: Response) => {
    let authToken = null;
    if (BW_ID_CLIENT_ID && BW_ID_CLIENT_SECRET) {
        authToken = await getAuthToken(BW_ID_CLIENT_ID as string, BW_ID_CLIENT_SECRET as string);
    } else {
        authToken = await getAuthToken(BW_USERNAME as string, BW_PASSWORD as string);
    }
    // Create Endpoint
    let endpointData;
    let endpointResponse = await fetch(`${HTTP_BASE_URL}/accounts/${ACCOUNT_ID}/endpoints`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "type": "WEBRTC",
                "direction": "BIDIRECTIONAL",
                "eventCallbackUrl": `${CALLBACK_BASE_URL}/api/callbacks/endpoints/status`,
                "eventFallbackUrl": `${CALLBACK_BASE_URL}/api/callbacks/endpoints/status`,
                "tag": "{\"myTag\": \"myTagValue\"}"
            })
        });
    if (!endpointResponse.ok) {
        throw new Error(`Endpoint creation failed: ${endpointResponse.status} ${await endpointResponse.text()}`);
    }
    endpointData = await endpointResponse.json();
    let endpoint = new Endpoint();
    console.log(`New endpoint created with ID: ${endpointData.data.endpointId}`);
    endpoint.endpointToken = endpointData.data.token
    endpoint.endpointId = endpointData.data.endpointId
    endpointAvailableMap.set(endpoint.endpointId, false);
    res.json(endpoint);
});

app.delete('/api/endpoint/:endpointId', async (req: Request, res: Response) => {
    const endpointId = req.params.endpointId;
    if (!endpointId) {
        res.status(400).send('Missing endpointId');
        return;
    }
    endpointAvailableMap.delete(endpointId);
    endpointCallIdMap.forEach((value, key) => {
        if (value === endpointId) {
            endpointCallIdMap.delete(key);
        }
    });

    let authToken = null;
    if (BW_ID_CLIENT_ID && BW_ID_CLIENT_SECRET) {
        authToken = await getAuthToken(BW_ID_CLIENT_ID as string, BW_ID_CLIENT_SECRET as string);
    } else {
        authToken = await getAuthToken(BW_USERNAME as string, BW_PASSWORD as string);
    }

    // Delete Endpoint
    let endpointResponse = await fetch(`${HTTP_BASE_URL}/v2/accounts/${ACCOUNT_ID}/endpoints/${endpointId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });
    if (!endpointResponse.ok) {
        throw new Error(`Endpoint deletion failed: ${endpointResponse.status} ${await endpointResponse.text()}`);
    }
    res.sendStatus(200);
});

app.post('/api/testCall', async (req: Request, res: Response) => {
    await placeCall(req.body.endpointId, req.body.toNumber, req.body.fromNumber)
    res.sendStatus(200);
})

app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
