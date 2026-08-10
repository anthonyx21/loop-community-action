import {
  BottomNav,
  colorFor,
  Header,
  labelFor,
  offerView,
  OfferRow,
  Status,
} from '../components/ui';

export function OverviewScreen({ setScreen, dashboard, offers, user }) {
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
