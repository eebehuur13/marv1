import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchWhoAmI } from './lib/api';
import { UploadPanel } from './components/UploadPanel';
import { ChatPanel } from './components/ChatPanel';

const queryClient = new QueryClient();

function Dashboard() {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['whoami'], queryFn: fetchWhoAmI });

  if (isLoading) {
    return (
      <main className="loading">
        <span aria-hidden>⏳</span>
        <p>Checking Access…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="error">
        <h2>Access required</h2>
        <p>{error instanceof Error ? error.message : 'Please sign in through Cloudflare Access.'}</p>
        <p>
          If you recently signed in, refresh this page. Otherwise, contact your Marble admin to join the
          access policy.
        </p>
      </main>
    );
  }

  const user = data?.user;

  return (
    <main className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h1>Project Marble</h1>
          <p>Ask anything about your team’s text docs.</p>
        </div>
        {user && (
          <div className="user-card">
            <span className="avatar">{user.email[0]?.toUpperCase()}</span>
            <div>
              <strong>{user.name ?? user.email}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        )}
        {uploadStatus && <p className="status-banner">{uploadStatus}</p>}
      </aside>
      <div className="content">
        <UploadPanel onStatusChange={setUploadStatus} />
        <ChatPanel />
      </div>
    </main>
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
