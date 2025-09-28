interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

export interface TextChunk {
  content: string;
  startLine: number;
  endLine: number;
  index: number;
}

function buildLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function locateLine(offsets: number[], charIndex: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = offsets[mid];
    const nextStart = mid + 1 < offsets.length ? offsets[mid + 1] : Number.MAX_SAFE_INTEGER;
    if (charIndex < start) {
      high = mid - 1;
    } else if (charIndex >= nextStart) {
      low = mid + 1;
    } else {
      return mid + 1; // 1-based line numbers
    }
  }
  return offsets.length;
}

export function chunkText(source: string, options: ChunkOptions): TextChunk[] {
  const { chunkSize, overlap } = options;
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be > 0');
  }

  const offsets = buildLineOffsets(source);
  const chunks: TextChunk[] = [];
  let index = 0;
  for (let position = 0; position < source.length; ) {
    const end = Math.min(source.length, position + chunkSize);
    const content = source.slice(position, end);
    const startLine = locateLine(offsets, position);
    const lastCharIndex = end > position ? end - 1 : position;
    const endLine = locateLine(offsets, lastCharIndex);

    chunks.push({
      content,
      startLine,
      endLine,
      index,
    });

    if (end === source.length) {
      break;
    }

    position = Math.max(0, end - overlap);
    index += 1;
  }
  return chunks;
}
