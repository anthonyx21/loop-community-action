import cors from 'cors';
import express from 'express';
import { readFile } from 'node:fs/promises';
import swaggerUi from 'swagger-ui-express';
import { GoogleGenAI, Type } from '@google/genai';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const required = ['GOOGLE_CLOUD_PROJECT', 'GEMINI_API_KEY'].filter((key) => !process.env[key]);
if (required.length)
  throw new Error(`Missing required backend environment variables: ${required.join(', ')}`);
const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : applicationDefault();
const firebaseApp =
  getApps()[0] || initializeApp({ credential, projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Gemini 3.1 Pro preview is the current highest-capability model with structured output support.
// Set GEMINI_MODEL to pin a different stable model when production stability is preferred.
const model = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
const allowedOrigins = (process.env.LOOP_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const orgPath = (id) => `organizations/${id}`;
const stamp = () => Timestamp.now();
const roles = ['viewer', 'contributor', 'coordinator', 'admin'];
const rateBuckets = new Map();

const app = express();
// A request ID makes Cloud Run logs and unexpected workflow errors traceable.
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});
app.use(
  cors({
    origin(origin, done) {
      if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin))
        return done(null, true);
      return done(new Error('Origin is not allowed by LOOP_ALLOWED_ORIGINS'));
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Loop-Organization-Id', 'Idempotency-Key'],
  }),
);
app.use(express.json({ limit: '256kb' }));

// Keep the API contract deployable with the service, rather than relying on
// a separately hosted documentation artifact.
app.get('/openapi.yaml', async (_req, res, next) => {
  try {
    const specification = await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
    res.type('application/yaml').send(specification);
  } catch (error) {
    next(error);
  }
});
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: 'LOOP Workflow API',
    swaggerOptions: { url: '/openapi.yaml' },
  }),
);

function text(value, field, max = 10000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${field} must be a non-empty string up to ${max} characters.`);
  return value.trim();
}

/** Validates organization IDs before they are interpolated into Firestore paths. */
function orgId(value) {
  const id = text(value, 'organizationId', 80);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id))
    throw new Error('organizationId may only contain letters, numbers, underscores, and hyphens.');
  return id;
}

/** Applies a small per-user, per-route in-memory rate limit for this Cloud Run instance. */
function rateLimit(req) {
  // Lightweight per-instance protection for accidental repeat clicks and abuse.
  // Production deployments can complement this with Cloud Armor or API Gateway.
  const key = `${req.user.uid}:${req.path}`;
  const entry = rateBuckets.get(key) || { count: 0, reset: Date.now() + 60_000 };
  if (Date.now() > entry.reset) {
    entry.count = 0;
    entry.reset = Date.now() + 60_000;
  }
  if (++entry.count > 30) {
    const error = new Error('Too many requests. Please try again in a minute.');
    error.status = 429;
    throw error;
  }
  rateBuckets.set(key, entry);
}

/** Writes an immutable record of a workflow transition for later review. */
async function audit(organizationId, actor, action, target, metadata = {}) {
  // Each state-changing workflow action leaves an organization-scoped audit trail.
  await db
    .collection(`${orgPath(organizationId)}/auditEvents`)
    .add({ actor, action, target, metadata, createdAt: stamp() });
}

/** Verifies the Firebase ID token and attaches its decoded identity to the request. */
async function requireUser(req, res, next) {
  try {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Missing Firebase ID token.');
    req.user = await auth.verifyIdToken(token);
    rateLimit(req);
    next();
  } catch (error) {
    res.status(error.status || 401).json({ message: error.message || 'Unauthenticated.' });
  }
}

/** Resolves the caller's active membership and organization-scoped role from Firestore. */
async function memberFor(req) {
  // Membership is checked from Firestore rather than trusting a client-supplied role.
  const id = orgId(req.get('x-loop-organization-id') || req.body.organizationId);
  const snapshot = await db.doc(`${orgPath(id)}/members/${req.user.uid}`).get();
  if (!snapshot.exists || snapshot.data().disabled) {
    const error = new Error('You are not an active member of this organization.');
    error.status = 403;
    throw error;
  }
  req.organizationId = id;
  req.member = snapshot.data();
}

/** Middleware factory that permits only the specified organization roles. */
function requireRole(...permitted) {
  return async (req, res, next) => {
    try {
      await memberFor(req);
      if (!permitted.includes(req.member.role)) {
        const error = new Error('Your organization role cannot perform this action.');
        error.status = 403;
        throw error;
      }
      next();
    } catch (error) {
      res.status(error.status || 403).json({ message: error.message || 'Forbidden.' });
    }
  };
}

/** Extracts structured, explicitly offered capacity with Gemini's JSON schema mode. */
async function extractCapacity(subject, body) {
  // Gemini is constrained to a JSON schema so extraction becomes reviewable
  // workflow data instead of free-form model prose.
  const response = await gemini.models.generateContent({
    model,
    contents: `Extract only capacity explicitly offered in this forwarded email. Never invent values.\nSubject: ${subject}\nBody:\n${body}`,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: Type.OBJECT,
        required: ['resources', 'summary'],
        properties: {
          summary: { type: Type.STRING },
          resources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['type', 'title', 'quantity', 'availabilityLabel'],
              properties: {
                type: {
                  type: Type.STRING,
                  enum: ['meals', 'space', 'transport', 'volunteer', 'other'],
                },
                title: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                availabilityLabel: { type: Type.STRING },
                locationLabel: { type: Type.STRING },
                accessibility: { type: Type.STRING },
                conditions: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });
  const result = JSON.parse(response.text || '{}');
  if (!Array.isArray(result.resources) || !result.resources.length)
    throw new Error('Gemini did not find a usable capacity resource.');
  return result;
}

/** Converts Gmail's URL-safe base64 payload into UTF-8 text. */
function decodeGmailPart(value) {
  return Buffer.from((value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
}

/** Finds the first plain-text payload, including nested MIME parts. */
function gmailBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data)
    return decodeGmailPart(payload.body.data);
  if (payload.body?.data && !payload.parts?.length) return decodeGmailPart(payload.body.data);
  return (payload.parts || []).map(gmailBody).find(Boolean) || '';
}

/** Fetches a Gmail API resource using a short-lived user or intake-mailbox token. */
async function gmailRequest(accessToken, path, options = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`Gmail API request failed with status ${response.status}.`);
  return response.json();
}

/** Reads one Gmail message and returns only the fields used by the intake workflow. */
async function readGmailMessage(accessToken, messageId) {
  const message = await gmailRequest(
    accessToken,
    `messages/${encodeURIComponent(messageId)}?format=full`,
  );
  const headers = Object.fromEntries(
    (message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]),
  );
  return { subject: headers.subject || '(No subject)', body: gmailBody(message.payload), headers };
}

/** Exchanges the intake mailbox's refresh token for a short-lived Gmail API token. */
async function intakeMailboxToken() {
  const requiredGmailSettings = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_INTAKE_REFRESH_TOKEN',
  ].filter((key) => !process.env[key]);
  if (requiredGmailSettings.length)
    throw new Error(`Missing Gmail sync configuration: ${requiredGmailSettings.join(', ')}.`);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_INTAKE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token)
    throw new Error('Could not refresh the intake mailbox token.');
  return token.access_token;
}

/** Extracts the organization ID from a plus-addressed intake mailbox recipient. */
function organizationFromIntakeAddress(headers) {
  const recipients = [headers.to, headers.delivered - to, headers['x-original-to']]
    .filter(Boolean)
    .join(',');
  return recipients.match(/\+([A-Za-z0-9_-]{3,80})@/i)?.[1] || null;
}

/** Marks an automatically processed inbox message as read only after it is safely handled. */
async function markGmailMessageRead(accessToken, messageId) {
  await gmailRequest(accessToken, `messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

/** Persists one intake and all Gemini-extracted offers in a single Firestore batch. */
async function createIntake({
  organizationId,
  userId,
  subject,
  body,
  source,
  sourceMessageId = null,
}) {
  // Intake and its pending offers commit together so a coordinator never sees
  // partially-created capacity from a successful extraction.
  const extraction = await extractCapacity(subject, body);
  const intakeRef = db.collection(`${orgPath(organizationId)}/intakes`).doc();
  const batch = db.batch();
  batch.set(intakeRef, {
    subject,
    body,
    source,
    sourceMessageId,
    extraction,
    status: 'review_required',
    createdBy: userId,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  const offerIds = extraction.resources.map((resource) => {
    const ref = db.collection(`${orgPath(organizationId)}/offers`).doc();
    batch.set(ref, {
      ...resource,
      intakeId: intakeRef.id,
      status: 'pending',
      createdBy: userId,
      createdAt: stamp(),
      updatedAt: stamp(),
    });
    return ref.id;
  });
  await batch.commit();
  await audit(organizationId, userId, 'intake.created', intakeRef.id, { source, offerIds });
  return { intakeId: intakeRef.id, offerIds, extraction };
}

/** Polls unread mail in LOOP's intake mailbox and creates pending offers automatically. */
async function syncIntakeMailbox() {
  const accessToken = await intakeMailboxToken();
  const inbox = await gmailRequest(
    accessToken,
    'messages?labelIds=INBOX&q=is%3Aunread&maxResults=25',
  );
  const results = { imported: [], skipped: [], failed: [] };

  for (const item of inbox.messages || []) {
    try {
      const message = await readGmailMessage(accessToken, item.id);
      const organizationId = organizationFromIntakeAddress(message.headers);
      if (!organizationId) {
        results.skipped.push({
          messageId: item.id,
          reason: 'No organization ID in intake address.',
        });
        continue;
      }
      if (!(await db.doc(orgPath(organizationId)).get()).exists) {
        results.skipped.push({ messageId: item.id, reason: 'Organization does not exist.' });
        continue;
      }
      const imported = await db
        .collection(`${orgPath(organizationId)}/intakes`)
        .where('sourceMessageId', '==', item.id)
        .limit(1)
        .get();
      if (!imported.empty) {
        await markGmailMessageRead(accessToken, item.id);
        results.skipped.push({ messageId: item.id, reason: 'Already imported.' });
        continue;
      }
      const intake = await createIntake({
        organizationId,
        userId: 'gmail-intake-service',
        subject: message.subject,
        body: message.body,
        source: 'gmail-auto-import',
        sourceMessageId: item.id,
      });
      await markGmailMessageRead(accessToken, item.id);
      results.imported.push({ messageId: item.id, intakeId: intake.intakeId });
    } catch (error) {
      results.failed.push({ messageId: item.id, message: error.message });
    }
  }
  return results;
}

/** Restricts scheduler-only mailbox polling to callers holding the worker secret. */
function requireWorkerKey(req, res, next) {
  if (!process.env.GMAIL_SYNC_KEY || req.get('x-loop-worker-key') !== process.env.GMAIL_SYNC_KEY)
    return res.status(401).json({ message: 'Invalid mailbox sync credentials.' });
  next();
}

// -----------------------------------------------------------------------------
// Service and organization setup
// -----------------------------------------------------------------------------

app.get('/healthz', (_req, res) =>
  res.status(200).json({ ok: true, service: 'loop-workflow-api' }),
);
app.post('/v1/organizations', requireUser, async (req, res, next) => {
  try {
    const id = orgId(req.body.organizationId);
    const ref = db.doc(orgPath(id));
    if ((await ref.get()).exists)
      return res.status(409).json({ message: 'That organization ID is already in use.' });
    const name = text(req.body.name, 'name', 160);
    const batch = db.batch();
    batch.set(ref, { name, createdBy: req.user.uid, createdAt: stamp(), updatedAt: stamp() });
    batch.set(db.doc(`${orgPath(id)}/members/${req.user.uid}`), {
      role: 'admin',
      email: req.user.email || null,
      createdAt: stamp(),
    });
    batch.set(db.doc(`${orgPath(id)}/dashboard/current`), { metrics: {}, updatedAt: stamp() });
    await batch.commit();
    await audit(id, req.user.uid, 'organization.created', id);
    res.status(201).json({ organizationId: id });
  } catch (error) {
    next(error);
  }
});

app.post('/v1/members', requireUser, requireRole('admin'), async (req, res, next) => {
  try {
    const uid = text(req.body.uid, 'uid', 128);
    const role = text(req.body.role, 'role', 24);
    if (!roles.includes(role)) throw new Error('role is invalid.');
    await db
      .doc(`${orgPath(req.organizationId)}/members/${uid}`)
      .set({ role, disabled: false, updatedAt: stamp() }, { merge: true });
    await audit(req.organizationId, req.user.uid, 'member.upserted', uid, { role });
    res.status(200).json({ uid, role });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// Capacity intake and human review
// -----------------------------------------------------------------------------

// Cloud Scheduler calls this endpoint to turn newly forwarded inbox messages
// into reviewable, pending capacity without a user copying a Gmail message ID.
app.post('/v1/gmail/sync', requireWorkerKey, async (_req, res, next) => {
  try {
    res.status(200).json(await syncIntakeMailbox());
  } catch (error) {
    next(error);
  }
});

app.post(
  '/v1/intake/forwarded-email',
  requireUser,
  requireRole('contributor', 'coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const result = await createIntake({
        organizationId: req.organizationId,
        userId: req.user.uid,
        subject: text(req.body.subject, 'subject', 500),
        body: text(req.body.body, 'body'),
        source: 'forwarded-email',
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/v1/gmail/import',
  requireUser,
  requireRole('contributor', 'coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const message = await readGmailMessage(
        text(req.body.gmailAccessToken, 'gmailAccessToken', 4096),
        text(req.body.messageId, 'messageId', 256),
      );
      const result = await createIntake({
        organizationId: req.organizationId,
        userId: req.user.uid,
        ...message,
        source: 'gmail-api',
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.post('/v1/needs', requireUser, requireRole('coordinator', 'admin'), async (req, res, next) => {
  try {
    const ref = db.collection(`${orgPath(req.organizationId)}/needs`).doc();
    const need = {
      title: text(req.body.title, 'title', 160),
      organization: text(req.body.organization, 'organization', 160),
      locationLabel: text(req.body.locationLabel, 'locationLabel', 240),
      people: Number(req.body.people) || 0,
      priority: ['high', 'medium', 'low'].includes(req.body.priority)
        ? req.body.priority
        : 'medium',
      timeWindow: text(req.body.timeWindow, 'timeWindow', 160),
      constraints:
        typeof req.body.constraints === 'string' ? req.body.constraints.slice(0, 1000) : '',
      status: 'open',
      createdBy: req.user.uid,
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    await ref.set(need);
    await audit(req.organizationId, req.user.uid, 'need.created', ref.id);
    res.status(201).json({ needId: ref.id, need });
  } catch (error) {
    next(error);
  }
});

app.patch(
  '/v1/offers/:offerId/review',
  requireUser,
  requireRole('coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const status = text(req.body.status, 'status', 16);
      if (!['approved', 'rejected'].includes(status))
        throw new Error('status must be approved or rejected.');
      const ref = db.doc(`${orgPath(req.organizationId)}/offers/${req.params.offerId}`);
      if (!(await ref.get()).exists) return res.status(404).json({ message: 'Offer not found.' });
      await ref.update({
        status,
        reviewedBy: req.user.uid,
        reviewedAt: stamp(),
        updatedAt: stamp(),
      });
      await audit(req.organizationId, req.user.uid, `offer.${status}`, ref.id);
      res.status(200).json({ offerId: ref.id, status });
    } catch (error) {
      next(error);
    }
  },
);

// -----------------------------------------------------------------------------
// Response planning, approval, and verified activation
// -----------------------------------------------------------------------------

app.post(
  '/v1/response-plans',
  requireUser,
  requireRole('coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const needRef = db.doc(
        `${orgPath(req.organizationId)}/needs/${text(req.body.needId, 'needId', 128)}`,
      );
      const need = await needRef.get();
      if (!need.exists) return res.status(404).json({ message: 'Need not found.' });
      const offers = (
        await db
          .collection(`${orgPath(req.organizationId)}/offers`)
          .where('status', '==', 'approved')
          .limit(20)
          .get()
      ).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (!offers.length)
        return res.status(409).json({
          message: 'Approve at least one capacity offer before creating a response plan.',
        });
      // Give Gemini only coordinator-approved offers, then validate every
      // returned resource ID before the proposal is stored.
      const prompt = `Make a concise, safe response plan using only these approved offers for this need. Return JSON with resources (array of offer IDs), reasoning, originLabel, destinationLabel, and estimatedImpact (mealsRedirected, warmSpaceHours, peopleSupported, wasteAvoidedKg). Need: ${JSON.stringify(need.data())}. Offers: ${JSON.stringify(offers)}`;
      const answer = await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            required: ['resources', 'reasoning', 'estimatedImpact'],
            properties: {
              resources: { type: Type.ARRAY, items: { type: Type.STRING } },
              reasoning: { type: Type.STRING },
              originLabel: { type: Type.STRING },
              destinationLabel: { type: Type.STRING },
              estimatedImpact: {
                type: Type.OBJECT,
                properties: {
                  mealsRedirected: { type: Type.NUMBER },
                  warmSpaceHours: { type: Type.NUMBER },
                  peopleSupported: { type: Type.NUMBER },
                  wasteAvoidedKg: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      });
      const plan = JSON.parse(answer.text || '{}');
      const validIds = new Set(offers.map((offer) => offer.id));
      plan.resources = (plan.resources || []).filter((id) => validIds.has(id));
      if (!plan.resources.length) throw new Error('Gemini did not produce a valid capacity match.');
      const ref = db.collection(`${orgPath(req.organizationId)}/responsePlans`).doc();
      await ref.set({
        ...plan,
        needId: needRef.id,
        status: 'proposed',
        createdBy: req.user.uid,
        createdAt: stamp(),
        updatedAt: stamp(),
      });
      await audit(req.organizationId, req.user.uid, 'responsePlan.proposed', ref.id, {
        needId: needRef.id,
      });
      res.status(201).json({ responsePlanId: ref.id, ...plan, status: 'proposed' });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/v1/response-plans/:planId/approve',
  requireUser,
  requireRole('coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const ref = db.doc(`${orgPath(req.organizationId)}/responsePlans/${req.params.planId}`);
      const plan = await ref.get();
      if (!plan.exists) return res.status(404).json({ message: 'Response plan not found.' });
      if (plan.data().status !== 'proposed')
        return res.status(409).json({ message: 'Only proposed plans can be approved.' });
      await ref.update({
        status: 'approved',
        approvedBy: req.user.uid,
        approvedAt: stamp(),
        updatedAt: stamp(),
      });
      await audit(req.organizationId, req.user.uid, 'responsePlan.approved', ref.id);
      res.status(200).json({ responsePlanId: ref.id, status: 'approved' });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  '/v1/response-plans/:planId/activate',
  requireUser,
  requireRole('coordinator', 'admin'),
  async (req, res, next) => {
    try {
      const planRef = db.doc(`${orgPath(req.organizationId)}/responsePlans/${req.params.planId}`);
      const plan = await planRef.get();
      if (!plan.exists) return res.status(404).json({ message: 'Response plan not found.' });
      const data = plan.data();
      // Activation is deliberately a separate transition. A model-generated
      // proposal cannot create a receipt until a coordinator approves it.
      if (data.status !== 'approved')
        return res
          .status(409)
          .json({ message: 'Only a human-approved response plan can be activated.' });
      const receiptRef = db.collection(`${orgPath(req.organizationId)}/impactReceipts`).doc();
      const batch = db.batch();
      batch.update(planRef, {
        status: 'active',
        activatedBy: req.user.uid,
        activatedAt: stamp(),
        updatedAt: stamp(),
      });
      batch.set(receiptRef, {
        responsePlanId: planRef.id,
        status: 'active',
        metrics: data.estimatedImpact || {},
        createdBy: req.user.uid,
        createdAt: stamp(),
        updatedAt: stamp(),
      });
      batch.set(
        db.doc(`${orgPath(req.organizationId)}/dashboard/current`),
        {
          activeResponsePlanId: planRef.id,
          updatedAt: stamp(),
          metrics: data.estimatedImpact || {},
        },
        { merge: true },
      );
      await batch.commit();
      await audit(req.organizationId, req.user.uid, 'responsePlan.activated', planRef.id, {
        receiptId: receiptRef.id,
      });
      res
        .status(200)
        .json({ responsePlanId: planRef.id, receiptId: receiptRef.id, status: 'active' });
    } catch (error) {
      next(error);
    }
  },
);

// -----------------------------------------------------------------------------
// Shared error handling and Cloud Run startup
// -----------------------------------------------------------------------------

app.use((error, req, res, _next) => {
  console.error(JSON.stringify({ requestId: req.requestId, error: error.message, path: req.path }));
  res.status(error.status || 500).json({
    message: error.message || 'Unexpected workflow service error.',
    requestId: req.requestId,
  });
});

app.listen(process.env.PORT || 8080, () =>
  console.log(
    JSON.stringify({ message: 'LOOP workflow API listening', port: process.env.PORT || 8080 }),
  ),
);
