import type { ChatResult, MarbleBindings } from '../types';

export class OpenAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIError';
  }
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export async function createEmbeddings(env: MarbleBindings, input: string[]): Promise<number[][]> {
  if (!env.OPENAI_API_KEY) {
    throw new OpenAIError('Missing OPENAI_API_KEY binding');
  }

  const model = env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new OpenAIError(`Embedding request failed: ${response.status} ${error}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  return payload.data.map((item) => item.embedding);
}

interface ContextBlock {
  folderName: string;
  fileName: string;
  startLine: number;
  endLine: number;
  content: string;
}

const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

const JSON_SCHEMA_FORMAT = {
  type: 'json_schema',
  name: 'marble_answer',
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            folder: { type: 'string' },
            file: { type: 'string' },
            lines: {
              type: 'array',
              items: { type: 'integer' },
              minItems: 2,
              maxItems: 2,
            },
          },
          required: ['folder', 'file', 'lines'],
          additionalProperties: false,
        },
      },
    },
    required: ['answer', 'citations'],
    additionalProperties: false,
  },
} as const;

async function callResponses(env: MarbleBindings, body: Record<string, unknown>): Promise<ChatResult> {
  if (!env.OPENAI_API_KEY) {
    throw new OpenAIError('Missing OPENAI_API_KEY binding');
  }

  const response = await fetch(RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new OpenAIError(`Chat request failed: ${response.status} ${error}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const candidates: unknown[] = [];
  const stringCandidates: string[] = [];

  const output = Array.isArray(payload.output) ? payload.output : [];
  output.forEach((entry) => {
    const message = entry as Record<string, unknown>;
    const blocks = Array.isArray(message.content) ? message.content : [];
    blocks.forEach((blockValue) => {
      const block = blockValue as Record<string, unknown>;
      if (!block || typeof block !== 'object') return;

      const jsonLike =
        block.output_json ??
        block.json ??
        block.data ??
        block.value ??
        block.response_json ??
        block.parsed;
      if (jsonLike) {
        candidates.push(jsonLike);
      }

      if (typeof block.text === 'string') {
        stringCandidates.push(block.text);
      }

      if (block.type === 'output_json_schema' || block.type === 'output_json') {
        const inner = (block.content ?? block.schema ?? null) as unknown;
        if (inner) {
          candidates.push(inner);
        }
      }
    });
  });

  const responseMessage = (payload.response ?? payload.message) as Record<string, unknown> | undefined;
  const responseBlocks = Array.isArray(responseMessage?.content) ? responseMessage.content : [];
  responseBlocks.forEach((blockValue) => {
    const block = blockValue as Record<string, unknown>;
    if (!block || typeof block !== 'object') return;

    const jsonLike =
      block.output_json ??
      block.json ??
      block.data ??
      block.value ??
      block.response_json ??
      block.parsed;
    if (jsonLike) {
      candidates.push(jsonLike);
    }

    if (typeof block.text === 'string') {
      stringCandidates.push(block.text);
    }
  });

  const responseOutputText = responseMessage?.output_text;
  if (typeof responseOutputText === 'string') {
    stringCandidates.push(responseOutputText);
  } else if (Array.isArray(responseOutputText)) {
    responseOutputText.forEach((item) => {
      if (typeof item === 'string') {
        stringCandidates.push(item);
      }
    });
  }

  const outputText = (payload as { output_text?: string[] | string }).output_text;
  if (typeof outputText === 'string') {
    stringCandidates.push(outputText);
  } else if (Array.isArray(outputText)) {
    outputText.forEach((item) => {
      if (typeof item === 'string') {
        stringCandidates.push(item);
      }
    });
  }

  const parsedResult = extractChatResultFromCandidates(candidates, stringCandidates);
  if (!parsedResult) {
    try {
      console.error('OpenAI response unparsed', JSON.stringify(payload));
    } catch {}
    return {
      answer: 'I had trouble parsing the model response.',
      citations: [],
    };
  }
  return parsedResult;
}

function extractChatResultFromCandidates(objects: unknown[], strings: string[]): ChatResult | null {
  for (const candidate of objects) {
    if (candidate && typeof candidate === 'object') {
      const result = normalizeChatResult(candidate as Record<string, unknown>);
      if (result) return result;
    }
  }

  for (const text of strings) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const result = normalizeChatResult(parsed);
      if (result) return result;
    } catch {
      if (text.trim()) {
        return { answer: text, citations: [] };
      }
    }
  }

  return null;
}

function normalizeChatResult(candidate: Record<string, unknown>): ChatResult | null {
  const answer = typeof candidate.answer === 'string' ? candidate.answer : undefined;
  const citationsRaw = candidate.citations;

  if (!answer && !Array.isArray(citationsRaw)) {
    return null;
  }

  const citations: ChatResult['citations'] = Array.isArray(citationsRaw)
    ? (citationsRaw.filter((item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).folder === 'string' &&
        typeof (item as Record<string, unknown>).file === 'string' &&
        Array.isArray((item as Record<string, unknown>).lines)
      ) as ChatResult['citations'])
    : [];

  return {
    answer: answer ?? '',
    citations,
  };
}

export async function generateStructuredAnswer(
  env: MarbleBindings,
  question: string,
  contexts: ContextBlock[],
): Promise<ChatResult> {
  if (!contexts.length) {
    return {
      answer: "I couldn't find anything relevant in your Marble files.",
      citations: [],
    };
  }

  const model = env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const contextMessage = contexts
    .map((ctx, index) => {
      return `Source ${index + 1} [${ctx.folderName} / ${ctx.fileName} : lines ${ctx.startLine}-${ctx.endLine}]
${ctx.content}`;
    })
    .join('\n\n');

  return callResponses(env, {
    model,
    input: [
      {
        role: 'system',
        content:
          'You are Marble, an assistant that answers questions about uploaded .txt files. Do not fabricate information. When citing, ensure the citations array includes the exact folder, file, and inclusive line range used.',
      },
      {
        role: 'system',
        content: `Context:\n${contextMessage}`,
      },
      {
        role: 'user',
        content: question,
      },
    ],
    text: {
      format: JSON_SCHEMA_FORMAT,
    },
  });
}

export async function generateGeneralAnswer(env: MarbleBindings, question: string): Promise<ChatResult> {
  const model = env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  return callResponses(env, {
    model,
    input: [
      {
        role: 'system',
        content:
          'You are Marble, a friendly assistant. Answer conversationally. If you are not explicitly given lookup context, respond from general knowledge and set the citations array to empty.',
      },
      {
        role: 'user',
        content: question,
      },
    ],
    text: {
      format: JSON_SCHEMA_FORMAT,
    },
  });
}
