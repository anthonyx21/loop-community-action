# Loop submission app

Production-oriented React/Vite client for Loop’s community-capacity workflow.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The app is presented in a 390px mobile frame on desktop and becomes full-screen on narrow screens.

## Workflow

1. A member forwards or imports a Gmail message.
2. Firebase Authentication verifies the member and Firestore membership determines their role.
3. Cloud Run uses Gemini to extract capacity into a pending offer.
4. A coordinator approves the offer, creates a response plan, and approves it.
5. A coordinator activates the approved plan and receives a Firestore impact receipt.

All workflow data is read from Firestore.

## Configuration

Copy `.env.sample` to `.env.local` and supply the Google service configuration
for Gemini, Maps Platform, Firebase, Google Identity, and Cloud Run. The app
requires Firebase authentication and Firestore data at runtime. Values prefixed with `VITE_` are
browser-visible; keep privileged Gemini and Firebase Admin credentials on the
Cloud Run server, never in `.env.local`.

## Google Build with AI technology list

For the Build with AI: Innovation Challenge submission, Loop is designed around these Google services:

- Gemini / Google AI Studio — unstructured offer and need extraction, constraint reasoning, and summaries
- Google Maps Platform — locations and route context in the match proposal
- Firebase — prototype data, activation state, impact receipts, and optional authentication/hosting
- Google Cloud Run or Firebase Hosting — deployment path for the web prototype

The UI authenticates through Firebase/Google, subscribes to the organization’s
Firestore `offers`, `needs`, `responsePlans`, and dashboard document, renders
route context with Maps Platform, and sends intake requests to Cloud Run. Cloud
Run is the secure boundary for Gemini extraction and workflow orchestration.

## Backend service

The Cloud Run implementation is in [`backend/`](backend/README.md). Deploy it
before using the UI. It verifies Firebase users, enforces membership roles,
uses Gemini only server-side, writes audit events, and owns every mutation.
Deploy `firebase.json` plus `firestore.rules` before exposing the client.
