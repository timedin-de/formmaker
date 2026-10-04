export type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'eof' };

const TWO_CHAR_OPS = ['==', '!=', '~=', '<=', '>=', '&&', '||'] as const;

const KEYWORD_OPS: Record<string, string> = {
  and: '&&',
  or: '||',
  not: '!',
};

export class ExpressionSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`${message} (at position ${position})`);
    this.name = 'ExpressionSyntaxError';
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  const fail = (msg: string, pos = i): never => {
    throw new ExpressionSyntaxError(msg, pos);
  };

  while (i < n) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // numbers (integer and decimal, optional leading '-')
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      let seenDot = false;
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
        if (src[j] === '.') {
          if (seenDot) fail('Unexpected second decimal point', j);
          seenDot = true;
        }
        j += 1;
      }
      const text = src.slice(i, j);
      if (text.endsWith('.')) fail('Malformed number', i);
      const value = Number(text);
      if (!Number.isFinite(value)) fail('Number overflow', i);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }

    // strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\') {
          const next = src[j + 1];
          if (next === undefined) fail('Unterminated string escape', j);
          value +=
            next === 'n'
              ? '\n'
              : next === 't'
                ? '\t'
                : next === 'r'
                  ? '\r'
                  : next === quote || next === '\\'
                    ? next
                    : '\\' + next;
          j += 2;
        } else if (c === quote) {
          closed = true;
          j += 1;
          break;
        } else {
          value += c;
          j += 1;
        }
      }
      if (!closed) fail('Unterminated string literal', i);
      tokens.push({ type: 'str', value });
      i = j;
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.-]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const kw = KEYWORD_OPS[word.toLowerCase()];
      if (kw) {
        tokens.push({ type: 'op', value: kw });
      } else if (word === 'true') {
        tokens.push({ type: 'op', value: 'true' });
      } else if (word === 'false') {
        tokens.push({ type: 'op', value: 'false' });
      } else if (word === 'null') {
        tokens.push({ type: 'op', value: 'null' });
      } else {
        tokens.push({ type: 'ident', value: word });
      }
      i = j;
      continue;
    }

    // two-char operators
    const two = src.slice(i, i + 2);
    if ((TWO_CHAR_OPS as readonly string[]).includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if ('+-*/%^<>=!~&|'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    fail(`Unexpected character '${ch}'`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}
