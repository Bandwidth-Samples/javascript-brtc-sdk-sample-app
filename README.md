# Bandwidth WebRTC Browser Dialer Sample

<img src="public/WebRTC-Icon-1024x1024.png" alt="WebRTC Icon" width="100" />

A sample application demonstrating how to build a browser-based Bandwidth RTC dialer using the Bandwidth Real-Time Communications (BRTC) JavaScript SDK. This application showcases the BRTC product by allowing you to place calls to phone numbers of your choice. The connection to arbitrary call-ids and endpoints is in progress.

## Overview

This sample application consists of two main components:

### Frontend (React)
- **Bandwidth RTC Integration**: Uses the `bandwidth-rtc` SDK to establish Bandwidth RTC connections
- **Media Controls**: Capture and manage audio input/output devices
- **Call Controls**: Dial phone numbers, accept incoming calls, and manage call state
- **Endpoint Management**: Create and manage WebRTC endpoints for phone number connections

### Backend (Node.js/Express)
- **Endpoint Management**: Creates and manages Bandwidth RTC endpoints
- **Call Orchestration**: Handles inbound and outbound call routing via Bandwidth Voice API
- **Callback Handling**: Processes webhooks for call and endpoint events
- **Token Management**: Manages OAuth2 authentication with Bandwidth API

## Features

### Currently Supported
- Make outbound calls from browser to phone numbers
- Receive inbound calls on browser endpoints
- Real-time audio streaming via Bandwidth RTC
- Dynamic endpoint creation and management
- Call state management and event handling
- Audio device selection and control

### In Progress
- Connection to arbitrary call-ids and endpoints

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Browser Client │ ◄─────► │  Express Server  │ ◄─────► │  Bandwidth API  │
│  (React App)    │         │  (Node.js)       │         │  (Voice/BRTC)   │
│  localhost:5000 │         │  localhost:3000   │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
  Bandwidth RTC                   HTTPS
                                     │
                                     │ Webhooks
                                     ▼
                            ┌──────────────────┐
                            │  ngrok/Public    │
                            │  Callback URL    │
                            └──────────────────┘
```

| Service          | Port | Description                        |
|------------------|------|------------------------------------|
| Express Server   | 3000 | Backend API and webhook handler    |
| React Dev Server | 5000 | Frontend development server        |

## Prerequisites

- Node.js 16+ and npm
- A Bandwidth account with:
  - Account ID
  - API credentials (username/password or client ID/secret)
  - A Bandwidth phone number
  - A configured Voice Application
  - Access to the BRTC role on your credentials
- ngrok or similar tunneling service for webhook callbacks

## Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd javascript-brtc-sdk-sample-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your Bandwidth credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Bandwidth API Configuration
HTTP_BASE_URL=https://api.bandwidth.com/v2

# Bandwidth Account Credentials (use either username/password OR client credentials)
ACCOUNT_ID=your_account_id
BW_USERNAME=your_username
BW_PASSWORD=your_password
# OR
# BW_ID_CLIENT_ID=your_client_id
# BW_ID_CLIENT_SECRET=your_client_secret

# Bandwidth Application Settings
APPLICATION_ID=your_application_id
FROM_NUMBER=+1XXXXXXXXXX

# Bandwidth RTC Gateway URL
# The Programmable Voice team will provide the customer with a gateway URL to connect to
REACT_APP_WSS_URL=wss://your-webrtc-gateway-url

# Public Callback URL (ngrok or similar)
CALLBACK_BASE_URL=https://your-callback-url.ngrok-free.app
```

### 4. Set Up Callback URL

Start ngrok to expose your local server:

```bash
ngrok http 3000
```

Copy the ngrok URL and update `CALLBACK_BASE_URL` in `.env.local`.

Update your Bandwidth Voice Application settings:
- **Callback URL**: `https://your-ngrok-url.ngrok-free.app/callbacks/bandwidth`
- **Call-initiated callback method**: `POST`
- **Status URL**: `https://your-ngrok-url.ngrok-free.app/callbacks/bandwidth/status`
- **Status callback method**: `POST`

### 5. Run the Application

The application requires two processes running simultaneously:

**Terminal 1 - Start the Backend Server:**
```bash
npm start
```
This starts the Express server on port 3000.

**Terminal 2 - Start the React Development Server:**
```bash
npm run react
```
This starts the React app on port 5000.

### 6. Access the Application

Open your browser and navigate to:
```
http://localhost:5000
```

## How to Use

1. **Create an Endpoint**: Click "Create Endpoint" to establish a Bandwidth RTC connection
2. **Select Audio Devices**: Choose your microphone and speakers from the available devices
3. **Make a Call**: Enter a phone number (with country code, e.g., +1234567890) and click "Call"
4. **Receive a Call**: When someone calls your Bandwidth number, the call will be routed to your browser
5. **End Call**: Click "Hang Up" to disconnect the call
6. **Delete Endpoint**: Click "Disconnect & Delete Endpoint" when done

**Note**: Currently, the application supports calling phone numbers. Connection to arbitrary call-ids and endpoints is under development.

## Project Structure

```
├── server/
│   ├── index.ts          # Express server with API endpoints and webhook handlers
│   └── types.ts          # TypeScript type definitions
├── src/
│   ├── components/
│   │   ├── CallController.tsx    # Call control UI (dial, hang up)
│   │   ├── EndpointHandler.tsx   # Endpoint creation and management
│   │   ├── MediaCapture.tsx      # Audio input device selection
│   │   ├── MediaPlayer.tsx       # Audio output device selection
│   │   └── Navbar.tsx            # Navigation bar
│   ├── css/              # Styles
│   └── App.tsx           # Main application component
├── .env.example          # Example environment variables
└── package.json
```

## Key API Endpoints

### Frontend → Backend
- `GET /token` - Create a new Bandwidth RTC endpoint and get JWT
- `DELETE /api/endpoint/:endpointId` - Delete an endpoint
- `POST /simulate-incoming-call` - Place a test call

### Bandwidth → Backend (Webhooks)
- `POST /callbacks/bandwidth` - BRTC endpoint events and incoming PSTN calls
- `POST /callbacks/bandwidth/status` - Voice API status events (disconnect)
- `POST /calls/answer` - Outbound call answer BXML callback
- `POST /calls/status` - Call status updates

### Utility
- `GET /health` - Health check
- `GET /debug/endpoints` - Inspect endpoint pool status

## Troubleshooting

**Issue**: "Missing required environment variable"
- **Solution**: Ensure all required variables in `.env.local` are set

**Issue**: Calls not connecting
- **Solution**: Verify your ngrok URL is set correctly and your Bandwidth Voice Application is configured with the correct callback URLs

**Issue**: No audio in calls
- **Solution**: Check browser permissions for microphone access and verify correct audio devices are selected

**Issue**: "Failed to fetch auth token"
- **Solution**: Verify your Bandwidth API credentials are correct

## Learn More

- [Bandwidth RTC Endpoint API reference](https://dev.bandwidth.com/apis/brtc-apis/)
- [Bandwidth RTC Connect Verb spec](https://dev.bandwidth.com/docs/voice/programmable-voice/bxml/connect)
- [bandwidth-rtc Javascript SDK](https://www.npmjs.com/package/bandwidth-rtc)
- [Bandwidth Programmable Voice APIs](https://dev.bandwidth.com/docs/voice/programmable-voice)

## Questions and Feedback

Reach out to `support@bandwidth.com` for any questions or feedback regarding this product.

## License

See repository license file for details.
