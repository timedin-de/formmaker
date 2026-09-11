export type Literal = string | number | boolean | null;

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '^' | '==' | '!=' | '~=' | '<' | '<=' | '>' | '>=' | '&&' | '||';

export type UnaryOp = '-' | '!';

export type Expr =
  | { type: 'literal'; value: Literal }
  | { type: 'identifier'; name: string }
  | { type: 'call'; name: string; args: Expr[] }
  | { type: 'unary'; op: UnaryOp; operand: Expr }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr };

/** Values the engine can produce/consume. Arrays collapse by helpers. */
export type ExprValue = Primitive | Primitive[];

export type Primitive = string | number | boolean | null;
