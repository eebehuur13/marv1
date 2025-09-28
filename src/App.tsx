import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchSession } from './lib/api';
import { FileManager } from './components/FileManager';
import { ChatPanel } from './components/ChatPanel';
import { clearDevIdentity, loadDevIdentity, saveDevIdentity } from './lib/auth';
import { useMemo, useState } from 'react';

const queryClient = new QueryClient();

function Dashboard() {
  const queryClient = useQueryClient();
  const initialIdentity = useMemo(() => loadDevIdentity(), []);
  const [devDisplayName, setDevDisplayName] = useState(initialIdentity?.displayName ?? '');
  const [devEmail, setDevEmail] = useState(initialIdentity?.email ?? '');
  const [devError, setDevError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 401) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const handleDevLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDevError(null);
    const email = devEmail.trim().toLowerCase();
    const name = devDisplayName.trim();
    if (!email) {
      setDevError('Enter an email address to continue.');
      return;
    }
    const existing = loadDevIdentity();
    const identity = {
      id: existing?.id ?? crypto.randomUUID(),
      email,
      displayName: name || email,
    };
    saveDevIdentity(identity);
    setDevDisplayName(identity.displayName);
    setDevEmail(identity.email);
    queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const handleLogout = () => {
    if (data?.mode === 'access') {
      window.location.assign('/cdn-cgi/access/logout');
      return;
    }
    clearDevIdentity();
    setDevDisplayName('');
    setDevEmail('');
    setDevError(null);
    queryClient.removeQueries({ queryKey: ['session'], exact: true });
    queryClient.invalidateQueries({ queryKey: ['session'] });
  };

  const isDevAuthError = error instanceof ApiError && error.status === 401 && error.message.includes('Missing identity');

  if (isLoading) {
    return (
      <main className="page-state">
        <span aria-hidden>⏳</span>
        <p>Checking Access…</p>
      </main>
    );
  }

  if (isDevAuthError) {
    return (
      <main className="page-state">
        <h2>Welcome to Marble</h2>
        <p>Sign in below to create a local workspace identity.</p>
        <form className="auth-form" onSubmit={handleDevLogin}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={devDisplayName}
              onChange={(event) => setDevDisplayName(event.target.value)}
              placeholder="Ada Lovelace"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={devEmail}
              onChange={(event) => setDevEmail(event.target.value)}
              placeholder="ada@example.com"
              required
            />
          </label>
          {devError && <p className="error-text">{devError}</p>}
          <button type="submit" className="button">
            Continue
          </button>
        </form>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="page-state error">
        <h2>Access Required</h2>
        <p>{error instanceof Error ? error.message : 'Please sign in through Cloudflare Access.'}</p>
        <a className="button" href="/cdn-cgi/access/login">
          Sign in with Google
        </a>
      </main>
    );
  }

  const user = data?.user;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div>
            <h1>Marble Workspace</h1>
            <p>Your calm command center for collective knowledge.</p>
          </div>
        </div>
        {user && (
          <div className="identity">
            <span className="avatar">{(user.displayName ?? user.email)[0]?.toUpperCase()}</span>
            <div>
              <strong>{user.displayName ?? user.email}</strong>
              <small>{user.email}</small>
            </div>
            <button type="button" className="link" onClick={handleLogout}>
              {data?.mode === 'access' ? 'Log out' : 'Sign out'}
            </button>
          </div>
        )}
      </header>
      <main className="app-main">
        {user && <FileManager currentUserId={user.id} />}
        <ChatPanel />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
