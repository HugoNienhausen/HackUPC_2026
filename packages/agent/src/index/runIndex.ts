import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFiles } from './scanFiles.js';
import { parseFile } from './parseClass.js';
import {
  detectMicroservices,
  microserviceFromPath,
} from './inferMicroservice.js';
import {
  extractDiscoveryEdgesFromFile,
  extractGatewayRouteEdges,
  extractHttpEdgesFromFile,
  extractImportEdges,
} from './edges.js';
import type { ClassRecord, Edge, IndexJson } from './types.js';

export async function runIndex(repoRoot: string): Promise<IndexJson> {
  const start = Date.now();
  const root = path.resolve(repoRoot);

  const microservices = await detectMicroservices(root);
  const files = await scanFiles(root);

  const classes: ClassRecord[] = [];
  const httpEdges: Edge[] = [];
  const discoveryEdges: Edge[] = [];

  for (const f of files) {
    const ms = microserviceFromPath(root, f.absolutePath);
    const content = await fs.readFile(f.absolutePath, 'utf8');
    const records = parseFile(f.absolutePath, f.relativePath, content, ms);
    classes.push(...records);
    httpEdges.push(...extractHttpEdgesFromFile(content, ms, f.relativePath));
    discoveryEdges.push(
      ...extractDiscoveryEdgesFromFile(content, ms, f.relativePath),
    );
  }

  const gatewayEdges = await extractGatewayRouteEdges(root);
  const importEdges = extractImportEdges(classes);

  const edges: Edge[] = [
    ...httpEdges,
    ...discoveryEdges,
    ...gatewayEdges,
    ...importEdges,
  ];

  return {
    generatedAt: new Date().toISOString(),
    repoPath: root,
    microservices,
    classes,
    edges,
    stats: {
      fileCount: files.length,
      classCount: classes.length,
      durationMs: Date.now() - start,
    },
  };
}
