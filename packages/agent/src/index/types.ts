export type ClassKind =
  | 'entity'
  | 'repository'
  | 'controller'
  | 'configuration'
  | 'application'
  | 'other';

export interface MethodInfo {
  name: string;
  signature: string;
  annotations: string[];
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  httpPath?: string;
  line: number;
}

export interface ClassRecord {
  fqn: string;
  simpleName: string;
  package: string;
  microservice: string | null;
  sourceFile: string;
  relativePath: string;
  kind: ClassKind;
  annotations: string[];
  imports: string[];
  methods: MethodInfo[];
  loc: number;
  flags: {
    bootstrap: boolean;
    crossCutting: boolean;
  };
}

export type EdgeType = 'import' | 'http' | 'gateway-route' | 'discovery';

export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  via?: string;
  sourceFile?: string;
  sourceLine?: number;
}

export interface IndexJson {
  generatedAt: string;
  repoPath: string;
  microservices: string[];
  classes: ClassRecord[];
  edges: Edge[];
  stats: {
    fileCount: number;
    classCount: number;
    durationMs: number;
  };
}
