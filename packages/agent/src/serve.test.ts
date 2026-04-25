import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Feature } from '@devmap/schema';
import { buildApp } from './serve.js';

const STUB_FEATURE: Feature = {
  devmapVersion: '1.0.0',
  generatedAt: '2026-04-25T00:00:00Z',
  feature: { name: 'visits', displayName: 'Visits', summary: 'stub' },
  repository: {
    name: 'stub',
    rootPath: '/tmp',
    language: 'java',
    framework: 'spring-boot',
    microservices: [],
  },
  components: [
    {
      id: 'a.A',
      fqn: 'a.A',
      simpleName: 'A',
      kind: 'controller',
      microservice: 'svc',
      filePath: 'A.java',
      annotations: [],
      publicMethods: [],
      summary: 's',
      core: true,
      loc: 1,
    },
  ],
  flow: { mermaid: 'sequenceDiagram', narrative: '', steps: [] },
  dependencies: { nodes: [], edges: [] },
  persistence: { mermaidER: 'erDiagram', entities: [], operations: [] },
  endpoints: [],
  events: { detected: false, scannedPatterns: [] },
  ownership: { codeowners: [], recentContributors: [] },
};

describe('serve.ts — Express app', () => {
  it('GET /feature.json returns 200 + JSON content-type + matching body', async () => {
    const app = buildApp(STUB_FEATURE, '/tmp');
    const r = await request(app).get('/feature.json');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.body.feature.name).toBe('visits');
    expect(r.body.components).toHaveLength(1);
  });

  it('GET /health returns ok + component count', async () => {
    const app = buildApp(STUB_FEATURE, '/tmp');
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, components: 1 });
  });

  it('GET /repo with .. is rejected (path traversal guard)', async () => {
    const app = buildApp(STUB_FEATURE, '/tmp');
    const r = await request(app).get('/repo/..%2Fetc%2Fpasswd');
    expect(r.status).toBe(400);
  });
});
