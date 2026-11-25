// Consume JSON values incrementally without retaining the full base64 payload.
const space = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const recordLimit = 48 * 1024 * 1024;

export function readBackupStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let chunk = '', offset = 0, done = false;

  async function fill() {
    while (offset === chunk.length && !done) {
      const next = await reader.read();
      done = next.done;
      chunk = decoder.decode(next.value, { stream: !done });
      offset = 0;
    }
    return offset < chunk.length;
  }

  async function peek() {
    while (await fill()) {
      while (offset < chunk.length && space(chunk[offset])) offset++;
      if (offset < chunk.length) return chunk[offset];
    }
  }

  async function expect(character) {
    if (await peek() !== character) throw new Error('Invalid or truncated backup JSON.');
    offset++;
  }

  async function value() {
    if (await peek() === undefined) throw new Error('Incomplete backup JSON.');
    let depth = 0, quoted = false, escaped = false, size = 0;
    const parts = [];
    const append = (part) => {
      size += part.length;
      if (size > recordLimit) throw new Error('One record in this backup is too large to restore safely.');
      parts.push(part);
    };
    while (await fill()) {
      const start = offset;
      for (; offset < chunk.length; offset++) {
        const c = chunk[offset];
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') quoted = false;
        } else if (c === '"') quoted = true;
        else if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') {
          if (!depth) break;
          depth--;
        } else if ((c === ',' || c === ':' || space(c)) && !depth) break;
      }
      append(chunk.slice(start, offset));
      if (offset < chunk.length) break;
    }
    return JSON.parse(parts.join(''));
  }

  async function* list() {
    await expect('[');
    if (await peek() !== ']') {
      for (;;) {
        yield await value();
        if (await peek() === ']') break;
        await expect(',');
      }
    }
    await expect(']');
  }

  return { peek, expect, value, list, close: () => reader.cancel() };
}
