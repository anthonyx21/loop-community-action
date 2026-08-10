export function WelcomeScreen({ onContinue, error }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-brand">
        <span className="welcome-mark loop-mark">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span>Loop</span>
      </div>
      <div className="welcome-copy">
        <p className="eyebrow">COMMUNITY CAPACITY ACTIVATION</p>
        <h1>
          Turn what’s
          <br />
          <em>available</em> into action.
        </h1>
        <p className="welcome-description">
          Loop helps communities coordinate resources before they expire.
        </p>
      </div>
      <button className="google-login" onClick={onContinue}>
        <span className="google-g">G</span>
        <span>Continue with Google</span>
      </button>
      {error && (
        <p className="welcome-legal" role="alert">
          {error}
        </p>
      )}
      <p className="welcome-legal">By continuing, you agree to Loop’s terms and privacy policy.</p>
    </main>
  );
}
