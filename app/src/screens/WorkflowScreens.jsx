import React, { useEffect, useState } from 'react';
import {
  activateResponsePlan,
  approveResponsePlan,
  createNeed,
  createResponsePlan,
  hasGoogleConfiguration,
  importGmailMessage,
  mapsEmbedUrl,
  missingGoogleConfiguration,
  observeUser,
  reviewOffer,
  signInWithGoogle,
  submitForwardedEmail,
  subscribeToLoopData,
} from '../google';
import {
  BottomNav,
  Brand,
  colorFor,
  Header,
  iconFor,
  labelFor,
  offerView,
  OfferRow,
  Status,
} from '../components/ui';
import { WelcomeScreen } from './WelcomeScreen';
import { OverviewScreen } from './OverviewScreen';

export function LegacyOverview({ setScreen, dashboard, offers, user }) {
  const plan = dashboard?.activeResponsePlan || {};
  const metrics = dashboard?.metrics || {};
  return (
    <>
      <Header
        action={
          <button className="avatar">{(user?.displayName || 'U').slice(0, 2).toUpperCase()}</button>
        }
      />
      <main className="screen overview-screen">
        <div className="greeting">
          <div>
            <p className="eyebrow">LIVE RESPONSE DATA</p>
            <h2>
              Good afternoon,
              <br />
              <em>{user?.displayName?.split(' ')[0] || 'there'}.</em>
            </h2>
          </div>
          <div className="pulse">
            <span></span>Live
          </div>
        </div>
        <section className="incident-card">
          <div className="incident-top">
            <div>
              <Status color={colorFor(plan.priority || 'pending')}>
                {labelFor(plan.priority || 'active')}
              </Status>
              <h3>{plan.title || 'No active response plan'}</h3>
              <p>{plan.locationLabel || 'Waiting for Firestore response data'}</p>
            </div>
            <span className="incident-icon">✦</span>
          </div>
          <div className="metric-row">
            <div>
              <strong>{metrics.peopleSupported ?? '—'}</strong>
              <span>people need support</span>
            </div>
            <div>
              <strong>{metrics.capacityConfirmed ?? '—'}</strong>
              <span>capacity confirmed</span>
            </div>
            <div>
              <strong>{metrics.timeRemaining ?? '—'}</strong>
              <span>until expiry</span>
            </div>
          </div>
          <button className="primary full" onClick={() => setScreen('incident')}>
            Open response <span>→</span>
          </button>
        </section>
        <div className="section-heading">
          <h3>Needs your attention</h3>
          <button onClick={() => setScreen('needs')}>See all</button>
        </div>
        <section className="attention-card" onClick={() => setScreen('match')}>
          <div className="attention-icon">!</div>
          <div>
            <strong>
              {plan.status
                ? `Response plan ${labelFor(plan.status)}`
                : 'No response plan available'}
            </strong>
            <p>{plan.summary || 'Create a response plan in the Google Cloud workflow.'}</p>
          </div>
          <span className="chevron">›</span>
        </section>
        <div className="section-heading">
          <h3>Live capacity</h3>
          <button onClick={() => setScreen('offers')}>Manage</button>
        </div>
        <div className="offer-list">
          {offers.map((offer) => (
            <OfferRow key={offer.id} {...offerView(offer)} />
          ))}
        </div>
      </main>
      <BottomNav screen="overview" setScreen={setScreen} />
    </>
  );
}

function Incident({ setScreen }) {
  return (
    <>
      <Header title="Response details" onBack={() => setScreen('overview')} />
      <main className="screen">
        <div className="detail-title">
          <Status color="red">High priority</Status>
          <h2>Cold-weather response</h2>
          <p>North District · Started 2 hours ago</p>
        </div>
        <div className="map-card">
          <iframe
            className="map-embed"
            title="North District response map"
            loading="lazy"
            src={mapsEmbedUrl()}
          ></iframe>
          <div className="map-label">
            <span className="dot red-dot"></span>Northside Outreach{' '}
            <span className="distance">2.1 km away</span>
          </div>
        </div>
        <div className="stat-grid">
          <div>
            <small>People needing support</small>
            <strong>32</strong>
          </div>
          <div>
            <small>Capacity confirmed</small>
            <strong>40</strong>
          </div>
          <div>
            <small>Unmet need</small>
            <strong className="warning">0</strong>
          </div>
          <div>
            <small>Time remaining</small>
            <strong>02:42</strong>
          </div>
        </div>
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">RESPONSE STATUS</p>
              <h3>All required capacity secured</h3>
            </div>
            <span className="check">✓</span>
          </div>
          <div className="progress">
            <span></span>
          </div>
          <p className="muted">Space, meals, transport and language support confirmed.</p>
        </section>
        <button className="primary full" onClick={() => setScreen('match')}>
          View response plan <span>→</span>
        </button>
      </main>
      <BottomNav screen="overview" setScreen={setScreen} />
    </>
  );
}

function Needs({ setScreen, needs, user, onError }) {
  const addNeed = async () => {
    try {
      const title = window.prompt('Need title');
      if (!title) return;
      await createNeed(
        {
          title,
          organization: window.prompt('Partner organization') || 'Community partner',
          locationLabel: window.prompt('Location') || 'Toronto, ON',
          people: Number(window.prompt('People needing support') || 0),
          priority: 'high',
          timeWindow: window.prompt('Time window') || 'Today',
          constraints: window.prompt('Constraints') || '',
        },
        user,
      );
    } catch (error) {
      onError(error.message);
    }
  };
  const makePlan = async (id) => {
    try {
      await createResponsePlan(id, user);
      setScreen('match');
    } catch (error) {
      onError(error.message);
    }
  };
  return (
    <>
      <Header
        title="Community needs"
        action={
          <button className="add-btn" onClick={addNeed}>
            ＋ Add
          </button>
        }
      />
      <main className="screen">
        <div className="tabs">
          <button className="selected">
            Active <b>{needs.length}</b>
          </button>
          <button>Unmatched</button>
          <button>Resolved</button>
        </div>
        {needs.map((need) => (
          <div className={`need-card ${need.priority === 'high' ? 'urgent' : ''}`} key={need.id}>
            <div className="need-card-top">
              <Status color={colorFor(need.priority || need.status)}>
                {labelFor(need.priority || need.status)}
              </Status>
              <span>{need.updatedLabel || 'Live'}</span>
            </div>
            <h3>{need.title || need.name}</h3>
            <p>{need.organization || need.organizationName || 'Community partner'}</p>
            <div className="need-details">
              <span>⌖ {need.locationLabel || 'Location pending'}</span>
              <span>◷ {need.timeWindow || need.timeWindowLabel || 'Time window pending'}</span>
            </div>
            <button className="outline full" onClick={() => makePlan(need.id)}>
              Create match proposal <span>→</span>
            </button>
          </div>
        ))}
        {needs.length === 0 && (
          <div className="small-note">
            <span>⌁</span>
            <p>No active needs are available in Firestore.</p>
          </div>
        )}
      </main>
      <BottomNav screen="needs" setScreen={setScreen} />
    </>
  );
}

function Offers({ setScreen, offers }) {
  const capacity = offers.reduce(
    (sum, offer) => sum + Number(offer.quantity || offer.capacity || 0),
    0,
  );
  return (
    <>
      <Header
        title="Live capacity"
        action={
          <button className="add-btn" onClick={() => setScreen('forward')}>
            ＋ Add
          </button>
        }
      />
      <main className="screen">
        <div className="offer-summary">
          <div>
            <span className="eyebrow">AVAILABLE NOW</span>
            <strong>{capacity || '—'}</strong>
            <p>total capacity units</p>
          </div>
          <div className="summary-ring">
            <b>{offers.length}</b>
            <small>live offers</small>
          </div>
        </div>
        <div className="offer-filter">
          <button className="selected">All</button>
          <button>Food</button>
          <button>Space</button>
          <button>Transport</button>
        </div>
        <div className="offer-list large">
          {offers.map((offer) => {
            const view = offerView(offer);
            return (
              <div className="offer-detail" key={offer.id}>
                <OfferRow {...view} />
                <div className="offer-footer">
                  <span>{offer.updatedLabel || 'Live from Firestore'}</span>
                  <button>Details →</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="email-intake" onClick={() => setScreen('forward')}>
          <div className="mail-icon">✉</div>
          <div>
            <strong>Forward an email to Loop</strong>
            <p>Submit it through the Cloud Run workflow</p>
          </div>
          <span>›</span>
        </div>
      </main>
      <BottomNav screen="offers" setScreen={setScreen} />
    </>
  );
}

function ForwardEmail({ setScreen, user, gmailAccessToken, onError }) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    try {
      await submitForwardedEmail(
        {
          source: 'gmail-forward',
          subject: 'Delivery confirmation — Northstar event',
          body: 'Hi Loop,\n\nWe have 40 unused packed meals from today’s Northstar event. The atrium is available until 8:00 PM, has step-free entry, and can seat 40.\n\nCan you help match this with a nearby need?\n\n— Maria Chen',
        },
        user,
      );
      setScreen('intake');
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  const importMessage = async () => {
    try {
      if (!gmailAccessToken) throw new Error('Reconnect with Google to grant Gmail read access.');
      const messageId = window.prompt('Paste the Gmail message ID to import');
      if (!messageId) return;
      setSubmitting(true);
      await importGmailMessage({ gmailAccessToken, messageId }, user);
      setScreen('intake');
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="gmail-fullscreen" aria-label="Gmail forwarding screen">
      <div className="gmail-appbar">
        <button onClick={() => setScreen('offers')} aria-label="Back">
          ‹
        </button>
        <strong>Gmail</strong>
        <span className="gmail-search">⌕ Search in mail</span>
        <button aria-label="More options">⋮</button>
      </div>
      <div className="gmail-compose">
        <div className="gmail-compose-head">
          <strong>Forward</strong>
          <button aria-label="Minimize">—</button>
        </div>
        <div className="gmail-field">
          <span>To</span>
          <strong>intake@loop.community</strong>
        </div>
        <div className="gmail-subject">Fwd: Delivery confirmation — Northstar event</div>
        <div className="gmail-draft-body">
          <p>Hi Loop,</p>
          <p>
            We have <b>40 unused packed meals</b> from today’s Northstar event. The atrium is
            available until <b>8:00 PM</b>, has <b>step-free entry</b>, and can seat 40.
          </p>
          <p>Can you help match this with a nearby need?</p>
          <p>
            — Maria Chen
            <br />
            <small>Office Manager, Northstar Financial</small>
          </p>
        </div>
        <div className="gmail-quoted">
          <div className="gmail-quote-toggle">⌄ &nbsp; Forwarded message</div>
          <div className="gmail-original-meta">
            <b>FreshPlate Catering</b>
            <br />
            <span>to Maria Chen · Today, 4:41 PM</span>
          </div>
          <b>Delivery confirmation — Northstar event</b>
          <p>
            120 meals delivered. Please let us know if there are any remaining portions after
            service.
          </p>
        </div>
        <div className="gmail-compose-footer">
          <button className="gmail-send" onClick={submit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send'} <span>➤</span>
          </button>
          <span>⌗</span>
          <span>A</span>
          <span>⌁</span>
          <span>⋮</span>
        </div>
      </div>
      <div className="gmail-demo-note">
        <span>✦</span>
        <p>
          <b>Zero-UI intake</b>
          <br />
          Maria forwards the existing email and adds the operational context Loop needs.
        </p>
        <button className="text-btn" onClick={importMessage} disabled={submitting}>
          Import a Gmail message
        </button>
      </div>
    </main>
  );
}

function Intake({ setScreen }) {
  return (
    <>
      <Header title="Loop intake" onBack={() => setScreen('offers')} />
      <main className="screen">
        <div className="intake-hero">
          <div className="mail-orbit">✦</div>
          <h2>Loop is extracting capacity.</h2>
          <p>AI is turning the forwarded email into resources your coordinator can review.</p>
        </div>
        <section className="email-preview">
          <div className="email-head">
            <span className="gmail-dot">F</span>
            <div>
              <strong>Forwarded from FreshPlate Catering</strong>
              <small>received by Loop · just now</small>
            </div>
            <span>✓</span>
          </div>
          <div className="email-body">
            <strong>Final catering count — Northstar event</strong>
            <p>
              <mark>40 individually packed hot meals</mark> · available until 8:00 p.m.
            </p>
            <p>
              <mark>Atrium · 40 seats · accessible entrance</mark>
            </p>
          </div>
          <div className="extracting">
            <span className="spinner"></span> Loop understood the message…
          </div>
        </section>
        <div className="extracted-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">LOOP UNDERSTOOD</p>
              <h3>2 resources found</h3>
            </div>
            <Status color="amber">Review needed</Status>
          </div>
          <div className="extract-item">
            <span className="resource-icon teal">◒</span>
            <div>
              <strong>Indoor space</strong>
              <p>40 seats · step-free entry</p>
            </div>
            <span>›</span>
          </div>
          <div className="extract-item">
            <span className="resource-icon amber">▣</span>
            <div>
              <strong>Hot meals</strong>
              <p>40 packed · expires 8:00 PM</p>
            </div>
            <span>›</span>
          </div>
        </div>
        <button className="primary full" onClick={() => setScreen('review')}>
          Review extracted offer <span>→</span>
        </button>
      </main>
    </>
  );
}

function Review({ setScreen, offers, user, onError }) {
  const offer = offers.find((item) => item.status === 'pending');
  const approve = async () => {
    try {
      await reviewOffer(offer.id, 'approved', user);
      setScreen('needs');
    } catch (error) {
      onError(error.message);
    }
  };
  return (
    <>
      <Header title="Review capacity" onBack={() => setScreen('intake')} />
      <main className="screen">
        <div className="review-title">
          <Status color="amber">Pending confirmation</Status>
          <h2>{offer?.title || 'No pending offer'}</h2>
          <p>
            {offer?.quantity || '—'} units · {offer?.availabilityLabel || 'availability pending'}
          </p>
        </div>
        <section className="card">
          <div className="card-heading">
            <h3>Offer details</h3>
          </div>
          <div className="detail-list">
            <div>
              <span>Location</span>
              <strong>{offer?.locationLabel || 'Not supplied'}</strong>
            </div>
            <div>
              <span>Accessibility</span>
              <strong>{offer?.accessibility || 'Not supplied'}</strong>
            </div>
            <div>
              <span>Conditions</span>
              <strong>{offer?.conditions || 'None supplied'}</strong>
            </div>
          </div>
        </section>
        <section className="privacy-note">
          <span>✓</span>
          <div>
            <strong>Coordinator confirmation required</strong>
            <p>Approval is recorded before this capacity can be matched.</p>
          </div>
        </section>
        <button className="primary full" disabled={!offer} onClick={approve}>
          Approve capacity <span>→</span>
        </button>
      </main>
    </>
  );
}

function Match({ setScreen, plan }) {
  const resources = plan.resources || [];
  return (
    <>
      <Header title="Match proposal" onBack={() => setScreen('needs')} />
      <main className="screen">
        <div className="proposal-hero">
          <div className="sparkle">✦</div>
          <p className="eyebrow">LOOP RECOMMENDS</p>
          <h2>{plan.title || 'No response plan selected'}</h2>
          <div className="confidence">
            <span>●</span> {labelFor(plan.status || 'pending')}{' '}
            <small>· {plan.requiredConditionsMet ?? 0} required conditions met</small>
          </div>
        </div>
        <section className="match-map">
          <iframe
            className="map-embed"
            title="Accessible route context"
            loading="lazy"
            src={mapsEmbedUrl(plan.originLabel, plan.destinationLabel)}
          ></iframe>
          <div className="route-label">
            <strong>{plan.distanceLabel || 'Route pending'}</strong>
            <span>{plan.travelLabel || 'Google Maps route context'}</span>
          </div>
        </section>
        <div className="match-bundle">
          <div className="bundle-heading">
            <h3>Response bundle</h3>
            <span>{resources.length} resources</span>
          </div>
          {resources.map((resource) => (
            <div className="bundle-row" key={resource.id || resource.title}>
              <span className={`resource-icon ${colorFor(resource.status)}`}>
                {iconFor(resource.type)}
              </span>
              <div>
                <strong>{resource.title}</strong>
                <p>{resource.summary || resource.availabilityLabel}</p>
              </div>
              <span className="green-check">✓</span>
            </div>
          ))}
          {!resources.length && (
            <p className="muted">Awaiting a Cloud Run-created response plan.</p>
          )}
        </div>
        <section className="reasoning">
          <div className="reasoning-head">
            <h3>Why this match?</h3>
            <span>Gemini reasoning</span>
          </div>
          <p>
            {plan.reasoning ||
              'Awaiting the validated constraint explanation from the workflow service.'}
          </p>
        </section>
        <button className="primary full" onClick={() => setScreen('activate')} disabled={!plan.id}>
          Review activation <span>→</span>
        </button>
      </main>
    </>
  );
}

function Activate({ setScreen, plan, user, onError }) {
  const [activated, setActivated] = useState(false);
  const activate = async () => {
    try {
      if (plan.status === 'proposed') await approveResponsePlan(plan.id, user);
      await activateResponsePlan(plan.id, user);
      setActivated(true);
    } catch (error) {
      onError(error.message);
    }
  };
  return (
    <>
      <Header title="Activation review" onBack={() => setScreen('match')} />
      <main className="screen">
        <div className="activation-title">
          <div className="activation-icon">✓</div>
          <p className="eyebrow">READY TO ACTIVATE</p>
          <h2>{plan.title || 'Response plan'}</h2>
          <p>{plan.timeWindowLabel || 'Activation time pending'}</p>
        </div>
        <section className="card checklist">
          <div className="card-heading">
            <h3>Safety checklist</h3>
            <Status color="teal">6 / 6 ready</Status>
          </div>
          {[
            ['Owner approval', 'Confirmed by provider'],
            ['Building access', 'Confirmed'],
            ['Step-free entry', 'Confirmed'],
            ['Food handoff', 'Confirmed'],
            ['Community organizer', 'Confirmed'],
            ['Emergency contact', 'Assigned'],
          ].map(([a, b]) => (
            <div className="check-row" key={a}>
              <span className="green-check">✓</span>
              <div>
                <strong>{a}</strong>
                <small>{b}</small>
              </div>
            </div>
          ))}
        </section>
        {activated ? (
          <section className="activated-banner">
            <span>✓</span>
            <div>
              <strong>Response plan active</strong>
              <p>The activation receipt is now in Firestore.</p>
            </div>
          </section>
        ) : (
          <>
            <section className="sms-preview">
              <div className="phone-dot">N</div>
              <div>
                <strong>Human approval required</strong>
                <p>Cloud Run will only activate an approved response plan.</p>
              </div>
              <Status color="blue">API</Status>
            </section>
            <button className="primary full" onClick={activate} disabled={!plan.id}>
              Activate response plan <span>→</span>
            </button>
          </>
        )}{' '}
        {activated && (
          <button className="primary full" onClick={() => setScreen('impact')}>
            View live response <span>→</span>
          </button>
        )}
      </main>
    </>
  );
}

function Impact({ setScreen, receipt }) {
  const metrics = receipt?.metrics || {};
  return (
    <>
      <Header title="Impact receipt" onBack={() => setScreen('overview')} />
      <main className="screen">
        <div className="impact-hero">
          <div className="big-check">✓</div>
          <p className="eyebrow">RESPONSE {receipt?.status?.toUpperCase() || 'PENDING'}</p>
          <h2>Verified impact receipt</h2>
          <p>{receipt?.responsePlanId || 'No active receipt in Firestore'}</p>
        </div>
        <section className="receipt-card">
          <div className="receipt-header">
            <Brand />
            <Status color="teal">{labelFor(receipt?.status || 'pending')}</Status>
          </div>
          <div className="impact-grid">
            {Object.entries(metrics).map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{labelFor(label)}</span>
              </div>
            ))}
            {!Object.keys(metrics).length && (
              <p className="muted">
                Impact metrics appear here after Cloud Run activates an approved plan.
              </p>
            )}
          </div>
          <div className="receipt-line"></div>
        </section>
        <button className="primary full" onClick={() => setScreen('overview')}>
          Back to overview <span>→</span>
        </button>
      </main>
    </>
  );
}

export function App() {
  const [screen, setScreen] = useState('overview');
  const [user, setUser] = useState(null);
  const [data, setData] = useState({
    offers: [],
    needs: [],
    responsePlans: [],
    impactReceipts: [],
    dashboard: null,
  });
  const [gmailAccessToken, setGmailAccessToken] = useState(null);
  const [error, setError] = useState('');
  const organizationId = import.meta.env.VITE_LOOP_ORGANIZATION_ID;
  // Authentication drives all data access: unauthenticated visitors see only
  // the sign-in screen, while members receive live organization state.
  useEffect(() => (hasGoogleConfiguration ? observeUser(setUser) : undefined), []);
  useEffect(
    () =>
      user
        ? subscribeToLoopData(
            organizationId,
            (update) => setData((current) => ({ ...current, ...update })),
            (error) => setError(error.message),
          )
        : undefined,
    [organizationId, user],
  );
  if (!hasGoogleConfiguration)
    return (
      <div className="configuration-error">
        <h1>Google service configuration required</h1>
        <p>
          Set the required values in <code>.env.local</code> before starting LOOP.
        </p>
        <code>{missingGoogleConfiguration.join('\n')}</code>
      </div>
    );
  // Prefer the dashboard's currently active plan; otherwise show the newest
  // available response plan so the workflow remains inspectable before activation.
  const plan =
    data.responsePlans.find((item) => item.id === data.dashboard?.activeResponsePlanId) ||
    data.responsePlans[0] ||
    {};
  const receipt =
    data.impactReceipts.find((item) => item.responsePlanId === plan.id) || data.impactReceipts[0];
  const content = {
    overview: (
      <OverviewScreen
        setScreen={setScreen}
        dashboard={{ ...data.dashboard, activeResponsePlan: plan }}
        offers={data.offers}
        user={user}
      />
    ),
    incident: <Incident setScreen={setScreen} />,
    needs: <Needs setScreen={setScreen} needs={data.needs} user={user} onError={setError} />,
    offers: <Offers setScreen={setScreen} offers={data.offers} />,
    forward: (
      <ForwardEmail
        setScreen={setScreen}
        user={user}
        gmailAccessToken={gmailAccessToken}
        onError={setError}
      />
    ),
    intake: <Intake setScreen={setScreen} />,
    review: <Review setScreen={setScreen} offers={data.offers} user={user} onError={setError} />,
    match: <Match setScreen={setScreen} plan={plan} user={user} onError={setError} />,
    activate: <Activate setScreen={setScreen} plan={plan} user={user} onError={setError} />,
    impact: <Impact setScreen={setScreen} receipt={receipt} />,
    map: <Incident setScreen={setScreen} />,
  }[screen];
  return (
    <div className={`app-shell ${user ? 'app-ready' : 'auth-mode'}`}>
      <div className="demo-layout">
        <div className="mobile-frame">
          <div className="statusbar">
            <span>9:41</span>
            <span>▮▮▮ ◔ ▰</span>
          </div>
          {user ? (
            content
          ) : (
            <WelcomeScreen
              onContinue={() =>
                signInWithGoogle()
                  .then((result) => setGmailAccessToken(result.gmailAccessToken))
                  .catch((error) => setError(error.message))
              }
              error={error}
            />
          )}
        </div>
      </div>
      {user && error && (
        <p className="runtime-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
