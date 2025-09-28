import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendChat, type ChatResponse } from '../lib/api';

interface ChatMessage {
  id: string;
  question: string;
  answer: string;
  status: 'loading' | 'streaming' | 'ready' | 'error';
  citations: ChatResponse['citations'];
  sources: ChatResponse['sources'];
  error?: string;
}

function createStreamingSteps(text: string): string[] {
  if (!text.length) {
    return [''];
  }
  const tokens = text.split(/(\s+)/);
  const steps: string[] = [];
  let buffer = '';
  tokens.forEach((token) => {
    buffer += token;
    steps.push(buffer);
  });
  return steps;
}

export function ChatPanel() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ question, messageId }: { question: string; messageId: string }) => {
      const response = await sendChat(question);
      return { response, messageId };
    },
    onSuccess: ({ response, messageId }) => {
      const steps = createStreamingSteps(response.answer);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                status: steps.length > 1 ? 'streaming' : 'ready',
                answer: steps.length ? steps[0] : '',
                citations: response.citations,
                sources: response.sources,
              }
            : message,
        ),
      );

      steps.slice(1).forEach((text, index) => {
        const timeout = window.setTimeout(() => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    status: index === steps.length - 2 ? 'ready' : 'streaming',
                    answer: text,
                  }
                : message,
            ),
          );
        }, 30 * (index + 1));
        timeoutsRef.current.push(timeout);
      });

      setStatus(null);
    },
    onError: (error: unknown, variables) => {
      const message = error instanceof Error ? error.message : 'Chat failed';
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === variables.messageId
            ? {
                ...entry,
                status: 'error',
                answer: '',
                error: message,
              }
            : entry,
        ),
      );
      setStatus(message);
    },
  });

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }
    const messageId = crypto.randomUUID();
    const text = question.trim();
    setQuestion('');
    setStatus('Thinking…');
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        question: text,
        answer: '',
        status: 'loading',
        citations: [],
        sources: [],
      },
    ]);
    mutation.mutate({ question: text, messageId });
  };

  return (
    <section className="panel chat-panel">
      <header className="panel-header">
        <h2>Marble Chat</h2>
        {status && <span className="status">{status}</span>}
      </header>
      <div className={`messages ${hasMessages ? '' : 'empty'}`}>
        {hasMessages ? (
          messages.map((message) => (
            <article key={message.id} className={`message ${message.status}`}>
              <h3>Q: {message.question}</h3>
              {message.status === 'error' ? (
                <p className="error">{message.error}</p>
              ) : (
                <p>{message.answer}</p>
              )}
              {message.citations.length > 0 && (
                <ul className="citations">
                  {message.citations.map((citation, index) => (
                    <li key={`${message.id}-${index}`}>
                      [{index + 1}] {citation.folder} / {citation.file} : lines {citation.lines[0]}–
                      {citation.lines[1]}
                    </li>
                  ))}
                </ul>
              )}
              {message.sources.length > 0 && (
                <details>
                  <summary>Sources</summary>
                  <ul className="sources">
                    {message.sources.map((source) => (
                      <li key={source.chunkId}>
                        <strong>
                          {source.folderName} / {source.fileName} : lines {source.startLine}–{source.endLine}
                        </strong>
                        <pre>{source.content}</pre>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))
        ) : (
          <p className="placeholder">Ask something about your Marble documents to get started.</p>
        )}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ask Marble about your files…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={mutation.isPending}
        />
        <button type="submit" disabled={mutation.isPending}>
          Send
        </button>
      </form>
    </section>
  );
}
