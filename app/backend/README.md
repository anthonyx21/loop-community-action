# LOOP workflow API

Cloud Run service for the secured part of LOOP: Firebase token verification,
Gemini extraction, Firestore workflow state, and human-approved activation.

## API

The OpenAPI 3.1 contract is committed as [`openapi.yaml`](openapi.yaml) and is
served by a deployed instance at `GET /openapi.yaml`. An interactive Swagger UI
is available at `GET /docs`.

- `GET /healthz`
- `POST /v1/organizations` — provisions an organization and its first admin
- `POST /v1/members` — admin-only membership/role management
- `POST /v1/intake/forwarded-email` and `POST /v1/gmail/import`
- `POST /v1/gmail/sync` — scheduler-only automatic intake mailbox processing
- `POST /v1/needs`
- `PATCH /v1/offers/:offerId/review`
- `POST /v1/response-plans`, `POST /v1/response-plans/:planId/approve`, and
  `POST /v1/response-plans/:planId/activate`

Every mutating request requires a Firebase ID token in `Authorization: Bearer
<token>` and an organization ID in `X-Loop-Organization-Id`. The service checks
that `organizations/{organizationId}/members/{uid}` exists and is not disabled.

## Firestore shape

```text
organizations/{organizationId}
  members/{uid}
  dashboard/current
  intakes/{intakeId}
  offers/{offerId}
  needs/{needId}
  responsePlans/{planId}
  impactReceipts/{receiptId}
```

The backend writes AI-extracted offers as `pending`. A coordinator approves an
offer, creates a Gemini-supported plan, then explicitly approves that plan;
only then can activation move it to `active`. Every write also records an
organization audit event.

## Automatic Gmail intake

LOOP can process forwarded email without a user manually selecting a Gmail
message. Configure a dedicated intake mailbox, then have partners forward to
`intake+ORGANIZATION_ID@YOUR_DOMAIN`. A Cloud Scheduler job calls
`POST /v1/gmail/sync` with `X-Loop-Worker-Key`; the service reads unread inbox
messages through Gmail API, derives the organization from the plus address,
creates pending offers through Gemini, and marks each successfully handled
message as read. Duplicate Gmail message IDs are skipped.

Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_INTAKE_REFRESH_TOKEN`, and `GMAIL_SYNC_KEY` as Cloud Run secrets. The
intake refresh token must belong to the dedicated mailbox and have
`gmail.readonly` and `gmail.modify` consent. Do not expose any of these values
to the Vite client.

## Deploy to Cloud Run

```bash
gcloud run deploy loop-workflow-api \
  --source backend \
  --region northamerica-northeast1 \
  --project YOUR_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GEMINI_MODEL=gemini-3.1-pro-preview,LOOP_ALLOWED_ORIGINS=https://YOUR_SITE.web.app \
  --set-secrets GEMINI_API_KEY=loop-gemini-api-key:latest
```

Use a Cloud Run service account with Firebase Admin/Firestore access. On Cloud
Run, Application Default Credentials are used automatically. For local work,
copy `.env.sample` to `.env` and provide `FIREBASE_SERVICE_ACCOUNT_JSON`.

After deployment, set `VITE_LOOP_API_BASE_URL` in the frontend `.env.local` to
the Cloud Run URL and redeploy the frontend.

The default model is `gemini-3.1-pro-preview`, which supports the structured
JSON output used by the workflow. Because it is a preview model, set
`GEMINI_MODEL` to a stable Gemini model if release stability matters more than
latest-model capability.
