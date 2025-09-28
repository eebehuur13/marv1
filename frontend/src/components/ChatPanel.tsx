import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendChat, type ChatResponse } from '../lib/api';

interface ChatMessage {
  id: string;
  prompt: string;
  answer: string;
  knowledgeMode: boolean;
  status: 'pending' | 'ready' | 'error';
  citations: ChatResponse['citations'];
  sources: ChatResponse['sources'];
  error?: string;
}

const KNOWLEDGE_STORAGE_KEY = 'marble-knowledge-mode';

export function ChatPanel() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [knowledgeMode, setKnowledgeMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    if (saved === 'true') setKnowledgeMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(KNOWLEDGE_STORAGE_KEY, knowledgeMode ? 'true' : 'false');
  }, [knowledgeMode]);

  const mutation = useMutation({
    mutationFn: async ({ id, question, knowledge }: { id: string; question: string; knowledge: boolean }) => {
      const response = await sendChat(question, knowledge);
      return { id, response };
    },
    onSuccess: ({ id, response }) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? {
                ...message,
                answer: response.answer,
                citations: response.citations,
                sources: response.sources,
                status: 'ready',
              }
            : message,
        ),
      );
      setStatus(null);
    },
    onError: (error: unknown, variables) => {
      const message = error instanceof Error ? error.message : 'Chat failed';
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === variables.id
            ? {
                ...entry,
                status: 'error',
                error: message,
              }
            : entry,
        ),
      );
      setStatus(message);
    },
  });

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    const id = crypto.randomUUID();
    const question = prompt.trim();
    setPrompt('');
    setStatus('Thinking…');
    setMessages((prev) => [
      ...prev,
      {
        id,
        prompt: question,
        answer: '',
        knowledgeMode,
        status: 'pending',
        citations: [],
        sources: [],
      },
    ]);
    mutation.mutate({ id, question, knowledge: knowledgeMode });
  };

  return (
    <section className="panel chat-panel prime">
      <header className="panel-header">
        <div>
          <h2>Conversational Search</h2>
          <p className="muted">Chat naturally and blend in workspace knowledge when you need it.</p>
        </div>
        <div className="chat-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={knowledgeMode}
              onChange={(event) => setKnowledgeMode(event.target.checked)}
            />
            <span>Knowledge Mode</span>
          </label>
          <small>{knowledgeMode ? 'Referencing org and private folders.' : 'Staying model-only.'}</small>
        </div>
      </header>

      {status && <div className="banner info">{status}</div>}

      <div className={`messages ${hasMessages ? '' : 'empty'}`}>
        {hasMessages ? (
          messages.map((message) => (
            <article key={message.id} className={`message ${message.status}`}>
              <div className="message__prompt">
                <span className="message__avatar user">You</span>
                <div>
                  <p className="message__prompt-text">{message.prompt}</p>
                </div>
              </div>
              <div className="message__response">
                <span className="message__avatar assistant">Marv</span>
                <div className="message__body">
                  {message.knowledgeMode && <span className="badge info message__badge">Knowledge Mode</span>}
                  {message.status === 'error' ? (
                    <p className="error-text">{message.error}</p>
                  ) : (
                    <p>{message.answer || 'Generating…'}</p>
                  )}
                  {message.citations.length > 0 && (
                    <ul className="citations">
                      {message.citations.map((citation, index) => (
                        <li key={`${message.id}-${index}`}>
                          <strong>#{index + 1}</strong> {citation.folder} / {citation.file} · lines {citation.lines[0]}–
                          {citation.lines[1]}
                        </li>
                      ))}
                    </ul>
                  )}
                  {message.sources.length > 0 && (
                    <details className="sources-disclosure">
                      <summary>Supporting Chunks</summary>
                      <ul className="sources">
                        {message.sources.map((source) => (
                          <li key={source.chunkId}>
                            <strong>
                              {source.folderName} / {source.fileName} · lines {source.startLine}–{source.endLine}
                            </strong>
                            <pre>{source.content}</pre>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="placeholder">Flip on knowledge mode to reference uploads, or chat freely without it.</p>
        )}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ask something…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={mutation.isPending}
        />
        <button type="submit" disabled={mutation.isPending || !prompt.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
