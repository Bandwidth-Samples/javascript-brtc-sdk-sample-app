import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { CallsApi, Configuration } from 'bandwidth-sdk';

const app = express();
app.use(cors());

// Log ALL incoming requests BEFORE body parsing
app.use((req, res, next) => {
    console.log(`\n>>> ${req.method} ${req.path} [${req.get('content-type') || 'no content-type'}]`);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/xml' }));

// Log parsed body
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log(JSON.stringify(req.body, null, 2));
    } else if (req.body && typeof req.body === 'string') {
        console.log(req.body);
    }
    next();
});

const PROD_VOICE_URL = 'https://voice.bandwidth.com/api/v2';

function getEnvVars() {
    const env = process.env;
    const hasUserPass = !!env.BW_USERNAME && !!env.BW_PASSWORD;
    const hasClientCreds = !!env.BW_ID_CLIENT_ID && !!env.BW_ID_CLIENT_SECRET;
    if (!hasUserPass && !hasClientCreds) {
        throw new Error('You must set either BW_USERNAME/BW_PASSWORD or BW_ID_CLIENT_ID/BW_ID_CLIENT_SECRET in your environment.');
    }
    const required = ['ACCOUNT_ID', 'APPLICATION_ID', 'FROM_NUMBER', 'CALLBACK_BASE_URL'];
    for (const v of required) {
        if (!env[v]) throw new Error(`Missing required environment variable: ${v}`);
    }
    return {
        HTTP_BASE_URL: (env.HTTP_BASE_URL || 'https://api.bandwidth.com/v2') as string,
        VOICE_URL: (env.VOICE_URL || PROD_VOICE_URL) as string,
        CALLBACK_BASE_URL: env.CALLBACK_BASE_URL as string,
        ACCOUNT_ID: env.ACCOUNT_ID as string,
        APPLICATION_ID: env.APPLICATION_ID as string,
        BW_USERNAME: env.BW_USERNAME as string | undefined,
        BW_PASSWORD: env.BW_PASSWORD as string | undefined,
        BW_ID_CLIENT_ID: env.BW_ID_CLIENT_ID as string | undefined,
        BW_ID_CLIENT_SECRET: env.BW_ID_CLIENT_SECRET as string | undefined,
        BW_ID_HOSTNAME: (env.BW_ID_HOSTNAME || 'https://api.bandwidth.com') as string,
        FROM_NUMBER: env.FROM_NUMBER as string,
        PORT: parseInt(env.PORT || '3000', 10),
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
    BW_ID_HOSTNAME,
    FROM_NUMBER,
    PORT,
} = getEnvVars();

// Endpoint ID -> Available Status
let endpointAvailableMap = new Map<string, boolean>();
// Call ID -> Endpoint ID
let endpointCallIdMap = new Map<string, string>();

// --- OAuth Token Management ---

let idToken: string = '';
let idTokenExpiration: number = 0;

async function getAuthToken(): Promise<string> {
    if (!idToken || Date.now() >= idTokenExpiration) {
        const username = BW_ID_CLIENT_ID || BW_USERNAME!;
        const password = BW_ID_CLIENT_SECRET || BW_PASSWORD!;
        console.log('Fetching new OAuth access token');
        const response = await fetch(`${BW_ID_HOSTNAME}/api/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' }),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch auth token: ${response.status} ${await response.text()}`);
        }
        const authData = await response.json();
        idToken = authData.access_token;
        idTokenExpiration = Date.now() + (authData.expires_in - 10) * 1000;
        console.log(`OAuth token obtained (expires in ${authData.expires_in}s)`);
    }
    return idToken;
}

// --- Endpoint / Call Helpers ---

async function placeCall(endpointId: string, toNumber: string, fromNumber: string): Promise<string> {
    if (!endpointAvailableMap.has(endpointId)) {
        throw new Error('Endpoint is not available');
    }

    let configuration: Configuration;
    if (BW_ID_CLIENT_ID && BW_ID_CLIENT_SECRET) {
        configuration = new Configuration({ clientId: BW_ID_CLIENT_ID, clientSecret: BW_ID_CLIENT_SECRET });
    } else {
        const token = await getAuthToken();
        configuration = new Configuration({ accessToken: token });
    }

    if (VOICE_URL !== PROD_VOICE_URL) {
        console.log(`Using custom voice URL: ${VOICE_URL}`);
        configuration.basePath = VOICE_URL;
    }

    const callsApi = new CallsApi(configuration);
    const body = {
        applicationId: APPLICATION_ID,
        to: toNumber,
        from: fromNumber,
        answerUrl: `${CALLBACK_BASE_URL}/calls/answer`,
    };

    const response = await callsApi.createCall(ACCOUNT_ID, body);
    const callId = response.data.callId;
    console.log(`Placed outbound call ${callId} from endpoint ${endpointId} to ${toNumber}`);
    endpointCallIdMap.set(callId, endpointId);
    return callId;
}

function claimFirstAvailableEndpoint(): string {
    for (const [endpointId, available] of endpointAvailableMap.entries()) {
        if (available) {
            claimEndpoint(endpointId);
            return endpointId;
        }
    }
    return '';
}

function claimEndpoint(endpointId: string) {
    if (endpointAvailableMap.has(endpointId)) {
        console.log(`Claiming endpoint from the pool ${endpointId}`);
        endpointAvailableMap.set(endpointId, false);
    }
}

function releaseEndpoint(endpointId: string) {
    if (endpointAvailableMap.has(endpointId)) {
        console.log(`Releasing endpoint to the pool ${endpointId}`);
        endpointAvailableMap.set(endpointId, true);
    }
}

function handleCallDisconnect(callId: string) {
    const endpointId = endpointCallIdMap.get(callId);
    if (endpointId) {
        releaseEndpoint(endpointId);
    }
    endpointCallIdMap.delete(callId);
}

function processInboundCall(callId: string): string {
    const requestingEndpointId = endpointCallIdMap.get(callId);
    if (!requestingEndpointId) {
        const endpointId = claimFirstAvailableEndpoint();
        if (endpointId === '') {
            return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <SpeakSentence voice="julie">You are on-hold. Please wait for an available endpoint to connect to this call.</SpeakSentence>
    <Redirect redirectUrl="${CALLBACK_BASE_URL}/calls/status"/>
</Response>`;
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <SpeakSentence voice="julie">Connecting</SpeakSentence>
    <Connect>
        <Endpoint>${endpointId}</Endpoint>
    </Connect>
</Response>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <SpeakSentence voice="julie">Connecting</SpeakSentence>
    <Connect>
        <Endpoint>${requestingEndpointId}</Endpoint>
    </Connect>
</Response>`;
}

// --- Routes ---

// GET /token - Create a BRTC endpoint and return the JWT token
app.get('/token', async (req: Request, res: Response) => {
    try {
        const authToken = await getAuthToken();

        const endpointUrl = `${HTTP_BASE_URL}/accounts/${ACCOUNT_ID}/endpoints`;
        console.log(`Creating endpoint: POST ${endpointUrl}`);

        const endpointResponse = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + authToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'WEBRTC',
                direction: 'BIDIRECTIONAL',
                eventCallbackUrl: `${CALLBACK_BASE_URL}/callbacks/bandwidth`,
                eventFallbackUrl: `${CALLBACK_BASE_URL}/callbacks/bandwidth`,
                tag: JSON.stringify({ source: 'javascript-sample-app' }),
            }),
        });

        if (!endpointResponse.ok) {
            const errorText = await endpointResponse.text();
            console.error(`Endpoint creation failed (${endpointResponse.status}): ${errorText}`);
            return res.status(endpointResponse.status).json({ error: 'Failed to create endpoint', details: errorText });
        }

        const endpointData = await endpointResponse.json();
        const endpointId: string = endpointData.data.endpointId;
        const token: string = endpointData.data.token;

        console.log(`Endpoint created: ${endpointId}`);
        endpointAvailableMap.set(endpointId, false);

        res.json({ token, endpointId });
    } catch (error: any) {
        console.error('Error creating endpoint:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/endpoint/:endpointId - Delete a BRTC endpoint
app.delete('/api/endpoint/:endpointId', async (req: Request, res: Response) => {
    const endpointId = req.params.endpointId;
    if (!endpointId) {
        res.status(400).send('Missing endpointId');
        return;
    }

    endpointAvailableMap.delete(endpointId);
    endpointCallIdMap.forEach((value, key) => {
        if (value === endpointId) endpointCallIdMap.delete(key);
    });

    try {
        const authToken = await getAuthToken();
        const endpointResponse = await fetch(`${HTTP_BASE_URL}/accounts/${ACCOUNT_ID}/endpoints/${endpointId}`, {
            method: 'DELETE',
            headers: {
                Authorization: 'Bearer ' + authToken,
                'Content-Type': 'application/json',
            },
        });
        if (!endpointResponse.ok) {
            const errorText = await endpointResponse.text();
            throw new Error(`Endpoint deletion failed: ${endpointResponse.status} ${errorText}`);
        }
        res.sendStatus(200);
    } catch (error: any) {
        console.error('Error deleting endpoint:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /callbacks/bandwidth - BRTC endpoint events AND incoming PSTN calls
app.post('/callbacks/bandwidth', async (req: Request, res: Response) => {
    const event = req.body;
    console.log('Callback event:', JSON.stringify(event, null, 2));

    const endpointId: string = event.endpointId;
    const eventType: string = event.event;
    const toType: string = event.toType;
    let to: string = event.to;

    // --- BRTC endpoint events ---
    switch (eventType) {
        case 'endpointIneligible':
            claimEndpoint(endpointId);
            return res.sendStatus(200);

        case 'endpointEligible':
            releaseEndpoint(endpointId);
            return res.sendStatus(200);

        case 'outboundConnectionRequest':
            console.log(`Outbound call request for endpoint ${endpointId} to ${to} (${toType})`);
            if (toType === 'PHONE_NUMBER') {
                if (!to.startsWith('+')) to = `+${to}`;
                try {
                    await placeCall(endpointId, to, FROM_NUMBER);
                } catch (error: any) {
                    console.error('Error placing outbound call:', error.message);
                }
            }
            return res.sendStatus(200);
    }

    // --- Incoming PSTN call (Voice API eventType: "initiate") ---
    if (event.eventType === 'initiate' && event.direction === 'inbound') {
        console.log(`Incoming PSTN call: ${event.from} -> ${event.to}, callId=${event.callId}`);
        const xmlResponse = processInboundCall(event.callId);
        if (event.callId) {
            const claimedEndpointId = endpointCallIdMap.get(event.callId);
            if (claimedEndpointId) {
                endpointCallIdMap.set(event.callId, claimedEndpointId);
            }
        }
        return res.type('application/xml').send(xmlResponse);
    }

    res.sendStatus(200);
});

// POST /callbacks/bandwidth/status - Voice API status events (disconnect, etc.)
app.post('/callbacks/bandwidth/status', (req: Request, res: Response) => {
    const event = req.body;
    console.log('Voice status event:', JSON.stringify(event, null, 2));

    if (event.eventType === 'disconnect') {
        console.log(`Call disconnected: ${event.callId}, cause: ${event.cause}`);
        handleCallDisconnect(event.callId);
    }

    res.sendStatus(200);
});

// POST /calls/answer - BXML callback when an outbound call is answered
app.post('/calls/answer', (req: Request, res: Response) => {
    const callId: string = req.body.callId;
    const xmlResponse = processInboundCall(callId);
    console.log(`Call answer callback for callId: ${callId}`);
    res.type('application/xml').send(xmlResponse);
});

// POST /calls/status - Call status updates (disconnect, redirect)
app.post('/calls/status', async (req: Request, res: Response) => {
    const callId: string = req.body.callId;
    const eventType: string = req.body.eventType;

    switch (eventType) {
        case 'disconnect':
            console.log(`Call disconnected with ID: ${callId}`);
            handleCallDisconnect(callId);
            res.sendStatus(200);
            break;
        case 'redirect':
        default:
            console.log(`Call status update for callId: ${callId} (${eventType})`);
            const xmlResponse = processInboundCall(callId);
            res.type('application/xml').send(xmlResponse);
            break;
    }
});

// POST /simulate-incoming-call - Place a test call to a specific endpoint
app.post('/simulate-incoming-call', async (req: Request, res: Response) => {
    const { endpointId, toNumber, fromNumber } = req.body;
    try {
        await placeCall(endpointId, toNumber || FROM_NUMBER, fromNumber || FROM_NUMBER);
        res.sendStatus(200);
    } catch (error: any) {
        console.error('Error placing test call:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /health
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// GET /debug/endpoints
app.get('/debug/endpoints', (req: Request, res: Response) => {
    const available: string[] = [];
    const unavailable: string[] = [];
    for (const [id, isAvailable] of endpointAvailableMap.entries()) {
        (isAvailable ? available : unavailable).push(id);
    }
    res.json({
        total: endpointAvailableMap.size,
        available,
        unavailable,
        callMappings: Object.fromEntries(endpointCallIdMap),
    });
});

// Catch-all
app.all('/{*path}', (req: Request, res: Response) => {
    console.log(`\n!!! UNMATCHED ROUTE: ${req.method} ${req.path}`);
    res.sendStatus(404);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`BRTC token server running on http://localhost:${PORT}`);
    console.log(`  Account:      ${ACCOUNT_ID}`);
    console.log(`  App ID:       ${APPLICATION_ID}`);
    console.log(`  From:         ${FROM_NUMBER}`);
    console.log(`  Callback:     ${CALLBACK_BASE_URL}`);
    console.log();
    console.log(`  GET    /token                      - Create endpoint and get JWT`);
    console.log(`  DELETE /api/endpoint/:endpointId   - Delete endpoint`);
    console.log(`  POST   /callbacks/bandwidth        - BRTC events + incoming PSTN calls`);
    console.log(`  POST   /callbacks/bandwidth/status - Voice API status (disconnect)`);
    console.log(`  POST   /calls/answer               - Outbound call answer BXML callback`);
    console.log(`  POST   /calls/status               - Call status updates`);
    console.log(`  POST   /simulate-incoming-call     - Place a test call`);
    console.log(`  GET    /health                     - Health check`);
    console.log(`  GET    /debug/endpoints            - Inspect endpoint pool`);
});
