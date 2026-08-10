export const iconFor = (type) =>
  ({ space: '◒', meals: '▣', transport: '⇄', volunteer: '文' })[type] || '◇';

export const colorFor = (status) =>
  ({ verified: 'teal', confirmed: 'blue', expiring: 'amber', pending: 'amber' })[
    String(status).toLowerCase()
  ] || 'blue';

export const labelFor = (value) =>
  String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const offerView = (offer) => ({
  icon: iconFor(offer.type),
  title: offer.title || offer.name || 'Unnamed capacity',
  sub: offer.providerName || offer.provider || labelFor(offer.type),
  meta: offer.summary || offer.availabilityLabel || 'Availability pending',
  state: labelFor(offer.status),
  color: colorFor(offer.status),
});

export function Brand() {
  return (
    <div className="brand">
      <span className="loop-mark">
        <i></i>
        <i></i>
        <i></i>
      </span>
      <span>Loop</span>
    </div>
  );
}

export function Header({ title, onBack, action }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Go back">
          ‹
        </button>
      ) : (
        <Brand />
      )}
      {title && <h1>{title}</h1>}
      {action || (
        <button className="icon-btn subtle" aria-label="Notifications">
          ♧
        </button>
      )}
    </header>
  );
}

export function Status({ children, color = 'teal' }) {
  return <span className={`status ${color}`}>{children}</span>;
}

export function BottomNav({ screen, setScreen }) {
  const items = [
    ['overview', '⌂', 'Home'],
    ['needs', '◎', 'Needs'],
    ['offers', '◇', 'Offers'],
    ['map', '⌁', 'Map'],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}>
          <span>{icon}</span>
          <small>{label}</small>
        </button>
      ))}
    </nav>
  );
}

export function OfferRow({ icon, title, sub, meta, state, color }) {
  return (
    <div className="offer-row">
      <div className={`resource-icon ${color}`}>{icon}</div>
      <div className="offer-copy">
        <strong>{title}</strong>
        <p>{sub}</p>
        <small>{meta}</small>
      </div>
      <Status color={color === 'blue' ? 'blue' : color}>{state}</Status>
    </div>
  );
}
