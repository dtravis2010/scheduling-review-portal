// SignInPage — preview: pick a made-up person. Emulator/real: emailed link.
import { useId, useState } from 'react';
import { useEditing } from './context';

const PreviewSignIn = ({ backend, onDone }) => {
  const groupId = useId();
  return (
    <>
      <p>
        This preview has no real accounts. Choose a made-up person to see what they can do.
        In the finished site, supervisors sign in with a link sent to their work email.
      </p>
      <p id={groupId}><strong>Sign in as:</strong></p>
      <ul className="choice-list" aria-labelledby={groupId}>
        {backend.people.map((p) => (
          <li key={p.uid}>
            <button type="button" className="choice-button" onClick={async () => { await backend.signInAs(p.uid); onDone(); }}>
              <strong>{p.name}</strong>
              <span className="muted">{p.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};

const EmailLinkSignIn = ({ backend }) => {
  const id = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ sent: false, error: '' });
  const send = async (e) => {
    e.preventDefault();
    try {
      await backend.sendSignInLink(email);
      setState({ sent: true, error: '' });
    } catch (err) {
      setState({ sent: false, error: err.message || 'Could not send the link. Check the email address and try again.' });
    }
  };
  if (state.sent) {
    return <p role="status">Check your email for a sign-in link from this site, then open it on this device.</p>;
  }
  return (
    <form onSubmit={send} className="edit-form">
      <div className="field">
        <label htmlFor={id}>Work email</label>
        <input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button type="submit" className="button-primary">Email me a sign-in link</button>
    </form>
  );
};

export default function SignInPage() {
  const { backend, user } = useEditing();
  const done = () => { window.location.hash = '#find'; };
  return (
    <section className="notice-panel" aria-labelledby="sign-in-title">
      <h1 id="sign-in-title">Supervisor sign-in</h1>
      <p className="muted">You only need to sign in to change guidance. Anyone can look exams up.</p>
      {user && <p>You're signed in as <strong>{user.name}</strong>.</p>}
      {backend.mode === 'preview' ? <PreviewSignIn backend={backend} onDone={done} /> : <EmailLinkSignIn backend={backend} />}
    </section>
  );
}
