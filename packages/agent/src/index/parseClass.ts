import path from 'node:path';
import type { ClassKind, ClassRecord, MethodInfo } from './types.js';

const CROSS_CUTTING_DENYLIST = new Set<string>(['MetricConfig']);

const MAPPING_ANNOTATIONS = [
  'GetMapping',
  'PostMapping',
  'PutMapping',
  'DeleteMapping',
  'PatchMapping',
] as const;

export function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];

    if (c === '/' && n === '*') {
      out.push(' ', ' ');
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out.push(src[i] === '\n' ? '\n' : ' ');
        i++;
      }
      if (i < src.length) {
        out.push(' ', ' ');
        i += 2;
      }
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out.push(' ');
        i++;
      }
      continue;
    }
    if (c === '"') {
      out.push(c);
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < src.length) {
          out.push(src[i]!, src[i + 1]!);
          i += 2;
          continue;
        }
        out.push(src[i]!);
        i++;
      }
      if (i < src.length && src[i] === '"') {
        out.push('"');
        i++;
      }
      continue;
    }
    if (c === "'") {
      out.push(c);
      i++;
      while (i < src.length && src[i] !== "'" && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < src.length) {
          out.push(src[i]!, src[i + 1]!);
          i += 2;
          continue;
        }
        out.push(src[i]!);
        i++;
      }
      if (i < src.length && src[i] === "'") {
        out.push("'");
        i++;
      }
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join('');
}

function lineStartIndex(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineFor(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

interface DeclSite {
  kind: 'class' | 'interface' | 'record' | 'enum';
  simpleName: string;
  annotations: string[];
  line: number;
  bodyStart: number;
  bodyEnd: number;
  isTopLevel: boolean;
}

const TYPE_DECL_RE = /\b(class|interface|record|enum)\s+([A-Z]\w*)/g;

function collectDeclarations(stripped: string): DeclSite[] {
  const starts = lineStartIndex(stripped);
  const decls: DeclSite[] = [];

  let m: RegExpExecArray | null;
  while ((m = TYPE_DECL_RE.exec(stripped))) {
    const kind = m[1] as DeclSite['kind'];
    const simpleName = m[2]!;
    const declStart = m.index;

    const lineNo = lineFor(starts, declStart);
    const lineStart = starts[lineNo - 1]!;
    const beforeOnLine = stripped.slice(lineStart, declStart);
    if (/[.<]/.test(beforeOnLine.trim().slice(-1))) continue;

    const annotations = collectAnnotationsAbove(stripped, starts, lineNo);
    const bodyStart = stripped.indexOf('{', declStart);
    if (bodyStart < 0) continue;
    const bodyEnd = matchBraces(stripped, bodyStart);
    if (bodyEnd < 0) continue;

    const isTopLevel = depthAtOffset(stripped, declStart) === 0;
    decls.push({
      kind,
      simpleName,
      annotations,
      line: lineNo,
      bodyStart,
      bodyEnd,
      isTopLevel,
    });
  }
  return decls;
}

function depthAtOffset(src: string, offset: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = 0; i < offset; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c as '"' | "'";
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth;
}

function matchBraces(src: string, openIdx: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c as '"' | "'";
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function collectAnnotationsAbove(
  stripped: string,
  starts: number[],
  declLine: number,
): string[] {
  const out: string[] = [];
  for (let ln = declLine - 1; ln >= 1; ln--) {
    const a = starts[ln - 1]!;
    const b = ln < starts.length ? starts[ln]! : stripped.length;
    const text = stripped.slice(a, b).trim();
    if (text === '') continue;
    if (text.startsWith('@')) {
      const m = text.match(/^@(\w+)/);
      if (m) out.unshift('@' + m[1]);
      continue;
    }
    if (
      /^(public|private|protected|static|final|abstract|sealed|non-sealed)\b/.test(
        text,
      )
    ) {
      continue;
    }
    break;
  }
  return out;
}

const METHOD_ANNO_RE = new RegExp(
  '@(' + MAPPING_ANNOTATIONS.join('|') + ')(?:\\s*\\(([^)]*)\\))?',
  'g',
);

function parseAnnotationPath(args: string): string | undefined {
  if (!args) return undefined;
  const valueRe = /(?:value\s*=\s*)?"([^"]*)"/;
  const m = args.match(valueRe);
  return m ? m[1] : undefined;
}

function extractMethods(
  stripped: string,
  bodyStart: number,
  bodyEnd: number,
): MethodInfo[] {
  const starts = lineStartIndex(stripped);
  const slice = stripped.slice(bodyStart, bodyEnd);
  const methods: MethodInfo[] = [];

  METHOD_ANNO_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METHOD_ANNO_RE.exec(slice))) {
    const httpMethod = m[1]!.replace('Mapping', '').toUpperCase() as MethodInfo['httpMethod'];
    const httpPath = parseAnnotationPath(m[2] ?? '');
    const after = slice.slice(m.index + m[0].length);

    const skipAnnoRe = /^(?:\s*@\w+(?:\([^)]*\))?)*\s*/;
    const sk = after.match(skipAnnoRe);
    const cursor = (sk ? sk[0].length : 0);

    const tail = after.slice(cursor);
    const sig = tail.match(/^[\s\S]*?\b([a-z_]\w*)\s*\(/);
    if (!sig) continue;
    const name = sig[1]!;

    const absoluteOffset = bodyStart + m.index;
    const annoLine = lineFor(starts, absoluteOffset);
    methods.push({
      name,
      signature: name + '(...)',
      annotations: ['@' + m[1]!],
      httpMethod,
      httpPath,
      line: annoLine,
    });
  }
  return methods;
}

function deriveKind(
  declKind: DeclSite['kind'],
  annotations: string[],
  simpleName: string,
  bodyHead: string,
): ClassKind {
  if (annotations.includes('@SpringBootApplication')) return 'application';
  if (annotations.includes('@Entity')) return 'entity';
  if (annotations.includes('@RestController') || annotations.includes('@Controller'))
    return 'controller';
  if (annotations.includes('@Configuration')) return 'configuration';
  if (annotations.includes('@Repository')) return 'repository';
  if (declKind === 'interface' && /Repository\b/.test(simpleName)) return 'repository';
  if (declKind === 'interface' && /\bextends\s+[\w.<>,\s]*Repository/.test(bodyHead))
    return 'repository';
  return 'other';
}

export function parseFile(
  absolutePath: string,
  relativePath: string,
  content: string,
  microservice: string | null,
): ClassRecord[] {
  const stripped = stripComments(content);
  const pkgMatch = stripped.match(/\bpackage\s+([\w.]+)\s*;/);
  const pkg = pkgMatch ? pkgMatch[1]! : '';

  const imports: string[] = [];
  const importRe = /\bimport\s+(?:static\s+)?([\w.*]+)\s*;/g;
  let im: RegExpExecArray | null;
  while ((im = importRe.exec(stripped))) imports.push(im[1]!);

  const decls = collectDeclarations(stripped);
  const loc = content.split('\n').length;

  const records: ClassRecord[] = [];
  const topLevel = decls.find((d) => d.isTopLevel);
  for (const d of decls) {
    const isTop = d === topLevel;
    const fqn = isTop
      ? pkg
        ? `${pkg}.${d.simpleName}`
        : d.simpleName
      : (pkg ? `${pkg}.${topLevel?.simpleName ?? '_'}.${d.simpleName}` : d.simpleName);
    const bodyHead = stripped.slice(
      Math.max(0, d.bodyStart - 200),
      d.bodyStart,
    );
    const kind = isTop
      ? deriveKind(d.kind, d.annotations, d.simpleName, bodyHead)
      : 'other';
    const methods = isTop ? extractMethods(stripped, d.bodyStart, d.bodyEnd) : [];
    records.push({
      fqn,
      simpleName: d.simpleName,
      package: pkg,
      microservice,
      sourceFile: absolutePath,
      relativePath,
      kind,
      annotations: d.annotations,
      imports: isTop ? imports : [],
      methods,
      loc,
      flags: {
        bootstrap: kind === 'application',
        crossCutting: CROSS_CUTTING_DENYLIST.has(d.simpleName),
      },
    });
  }

  if (records.length === 0) {
    records.push({
      fqn: pkg ? `${pkg}.${path.basename(absolutePath, '.java')}` : path.basename(absolutePath, '.java'),
      simpleName: path.basename(absolutePath, '.java'),
      package: pkg,
      microservice,
      sourceFile: absolutePath,
      relativePath,
      kind: 'other',
      annotations: [],
      imports,
      methods: [],
      loc,
      flags: { bootstrap: false, crossCutting: false },
    });
  }
  return records;
}
