import { ExpressionSyntaxError, tokenize, type Token } from './lexer';
import type { BinaryOp, Expr, UnaryOp } from './ast';

export { ExpressionSyntaxError } from './lexer';

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '~=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 7,
};

export function parse(src: string): Expr {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token => tokens[pos];
  const advance = (): Token => tokens[pos++];
  const fail = (msg: string): never => {
    throw new ExpressionSyntaxError(msg, pos);
  };

  function parseExpression(): Expr {
    return parseBinary(1);
  }

  function parseBinary(minPrec: number): Expr {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token.type !== 'op') break;
      const prec = BINARY_PRECEDENCE[token.value];
      if (prec === undefined || prec < minPrec) break;
      advance();
      const right = parseBinary(prec + 1);
      left = { type: 'binary', op: token.value as BinaryOp, left, right };
    }
    return left;
  }

  function parseUnary(): Expr {
    const token = peek();
    if (token.type === 'op' && (token.value === '-' || token.value === '!')) {
      advance();
      return { type: 'unary', op: token.value as UnaryOp, operand: parseUnary() };
    }
    // a leading + is allowed and ignored
    if (token.type === 'op' && token.value === '+') {
      advance();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): Expr {
    const token = advance();
    switch (token.type) {
      case 'num':
        return { type: 'literal', value: token.value };
      case 'str':
        return { type: 'literal', value: token.value };
      case 'ident':
        if (peek().type === 'lparen') {
          advance();
          const args: Expr[] = [];
          if (peek().type !== 'rparen') {
            args.push(parseExpression());
            while (peek().type === 'comma') {
              advance();
              args.push(parseExpression());
            }
          }
          if (peek().type !== 'rparen') fail('Expected )');
          advance();
          return { type: 'call', name: token.value, args };
        }
        return { type: 'identifier', name: token.value };
      case 'op':
        if (token.value === 'true') return { type: 'literal', value: true };
        if (token.value === 'false') return { type: 'literal', value: false };
        if (token.value === 'null') return { type: 'literal', value: null };
        fail(`Unexpected operator '${token.value}'`);
        break;
      case 'lparen': {
        const expr = parseExpression();
        const close = peek();
        if (close.type !== 'rparen') fail('Expected )');
        advance();
        return expr;
      }
      default:
        fail('Expected an expression');
    }

    throw new ExpressionSyntaxError('Unreachable', pos);
  }

  const expr = parseExpression();
  const tail = peek();
  if (tail.type !== 'eof') {
    fail(`Unexpected trailing token '${tail.type === 'op' ? tail.value : ''}'`);
  }
  return expr;
}

/** Collect the underlying field (identifier) references used by an AST. */
export function collectReferences(expr: Expr, out: Set<string> = new Set<string>()): Set<string> {
  switch (expr.type) {
    case 'literal':
      return out;
    case 'identifier':
      out.add(expr.name);
      return out;
    case 'unary':
      return collectReferences(expr.operand, out);
    case 'binary':
      collectReferences(expr.left, out);
      collectReferences(expr.right, out);
      return out;
    case 'call':
      for (const arg of expr.args) collectReferences(arg, out);
      return out;
  }
}
