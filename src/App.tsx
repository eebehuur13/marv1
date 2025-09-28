import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fetchSession } from './lib/api';
import { FileManager } from './components/FileManager';
import { ChatPanel } from './components/ChatPanel';

const queryClient = new QueryClient();

function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['session'], queryFn: fetchSession });

  if (isLoading) {
    return (
      <main className="page-state">
        <span aria-hidden>⏳</span>
        <p>Checking Access…</p>
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
            <h1>Marv1 Workspace</h1>
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
