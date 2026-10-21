import { parse } from "@babel/parser";

const TSX_FILE = /\.tsx$/;
const TS_FILE = /\.ts$|\.mts$|\.cts$/;

/**
 * Source transform for inline chains. Rewrites
 *
 *   trace("name", () => order.items.filter(f).map(g))
 *
 * into the explicit-input form the runtime already traces:
 *
 *   trace("name", order.items, (__backstep_input) => __backstep_input.filter(f).map(g))
 *
 * Only calls to `trace` imported from "@gabrielvfonseca/backstep" are touched, and only when the callback is a
 * zero-argument arrow whose body is a chain of array methods over a single receiver.
 */

export interface TransformResult {
  readonly changed: boolean;
  readonly code: string;
}

/** Array methods that make a chain worth rewriting. Other calls are left alone. */
const ARRAY_METHODS = new Set([
  "filter",
  "map",
  "flatMap",
  "reduce",
  "reduceRight",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "some",
  "every",
  "sort",
  "toSorted",
  "slice",
]);

const PACKAGE = "@gabrielvfonseca/backstep";
const PARAM = "__backstep_input";

interface Node {
  readonly end: number;
  readonly start: number;
  readonly type: string;
  readonly [key: string]: unknown;
}

interface Edit {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export function transformSource(code: string, filename = "module.ts"): TransformResult {
  if (!code.includes(PACKAGE)) {
    return { changed: false, code };
  }

  const ast = parse(code, {
    plugins: pluginsFor(filename),
    sourceType: "module",
  });
  const program = ast.program as unknown as Node;
  const traceNames = new Set<string>();
  const namespaceNames = new Set<string>();
  for (const statement of body(program)) {
    if (statement.type !== "ImportDeclaration" || source(statement) !== PACKAGE) {
      continue;
    }
    for (const specifier of list(statement, "specifiers")) {
      const local = identifierName(specifier, "local");
      if (specifier.type === "ImportNamespaceSpecifier" && local) {
        namespaceNames.add(local);
      } else if (
        specifier.type === "ImportSpecifier" &&
        local &&
        identifierName(specifier, "imported") === "trace"
      ) {
        traceNames.add(local);
      }
    }
  }
  if (traceNames.size === 0 && namespaceNames.size === 0) {
    return { changed: false, code };
  }

  const edits: Edit[] = [];
  const collision = code.includes(PARAM);
  visit(program, (node) => {
    if (node.type !== "CallExpression" || !isTraceCall(node, traceNames, namespaceNames)) {
      return true;
    }
    const edit = rewrite(node, code, collision);
    if (edit) {
      edits.push(edit);
      return false;
    }
    return true;
  });

  if (edits.length === 0) {
    return { changed: false, code };
  }
  let output = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { changed: true, code: output };
}

function rewrite(call: Node, code: string, collision: boolean): Edit | undefined {
  const args = list(call, "arguments");
  const [nameArg, callbackArg, optionsArg] = args;
  if (!(nameArg && callbackArg) || callbackArg.type !== "ArrowFunctionExpression") {
    return undefined;
  }
  if (list(callbackArg, "params").length !== 0 || callbackArg.async === true) {
    return undefined;
  }
  const expr = arrowExpression(callbackArg);
  if (!expr) {
    return undefined;
  }
  const chain = findChainRoot(expr);
  if (!chain) {
    return undefined;
  }
  if (collision) {
    return undefined;
  }

  const bodyText =
    code.slice(expr.start, chain.root.start) + PARAM + code.slice(chain.root.end, expr.end);
  const calleeText = code.slice((call.callee as Node).start, (call.callee as Node).end);
  const nameText = code.slice(nameArg.start, nameArg.end);
  const rootText = code.slice(chain.root.start, chain.root.end);
  const optionsText = optionsArg ? `, ${code.slice(optionsArg.start, optionsArg.end)}` : "";
  return {
    end: call.end,
    start: call.start,
    text: `${calleeText}(${nameText}, ${rootText}, (${PARAM}) => ${bodyText}${optionsText})`,
  };
}

/** The expression a zero-argument arrow returns: its body, or the single return in a block. */
function arrowExpression(arrow: Node): Node | undefined {
  const bodyNode = arrow.body as Node;
  if (bodyNode.type !== "BlockStatement") {
    return bodyNode;
  }
  const statements = list(bodyNode, "body");
  const [only] = statements;
  if (statements.length === 1 && only && only.type === "ReturnStatement") {
    return (only.argument as Node | null) ?? undefined;
  }
  return undefined;
}

/**
 * Walks down a chain of method calls to its receiver. The chain qualifies when the innermost call
 * is an array method, so `x.filter(…).map(…)` yields root `x`.
 */
function findChainRoot(expr: Node): { root: Node } | undefined {
  let node = expr;
  let innermost: string | undefined;
  let root: Node | undefined;
  while (isMemberCall(node)) {
    const callee = node.callee as Node;
    innermost = identifierName(callee, "property");
    root = callee.object as Node;
    node = root;
  }
  if (!(root && innermost && ARRAY_METHODS.has(innermost))) {
    return undefined;
  }
  return { root };
}

function isMemberCall(node: Node): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee as Node;
  return (
    callee.type === "MemberExpression" &&
    callee.computed !== true &&
    callee.property !== undefined &&
    (callee.property as Node).type === "Identifier"
  );
}

function isTraceCall(call: Node, names: Set<string>, namespaces: Set<string>): boolean {
  const callee = call.callee as Node;
  if (callee.type === "Identifier") {
    return names.has(callee.name as string);
  }
  return (
    callee.type === "MemberExpression" &&
    identifierName(callee, "property") === "trace" &&
    (callee.object as Node).type === "Identifier" &&
    namespaces.has((callee.object as Node).name as string)
  );
}

function pluginsFor(filename: string): ("typescript" | "jsx")[] {
  if (TSX_FILE.test(filename)) {
    return ["typescript", "jsx"];
  }
  if (TS_FILE.test(filename)) {
    return ["typescript"];
  }
  return ["jsx"];
}

function visit(node: Node, enter: (node: Node) => boolean): void {
  if (!enter(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          visit(child, enter);
        }
      }
    } else if (isNode(value)) {
      visit(value, enter);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function body(program: Node): Node[] {
  return list(program, "body");
}

function list(node: Node, key: string): Node[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function source(declaration: Node): string | undefined {
  const literal = declaration.source as Node | undefined;
  return literal && typeof literal.value === "string" ? literal.value : undefined;
}

function identifierName(node: Node, key: string): string | undefined {
  const child = node[key] as Node | undefined;
  if (!child) {
    return undefined;
  }
  if (child.type === "Identifier" && typeof child.name === "string") {
    return child.name;
  }
  return undefined;
}
