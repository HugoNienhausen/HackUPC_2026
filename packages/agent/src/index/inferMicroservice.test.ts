import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectMicroservices, microserviceFromPath } from './inferMicroservice.js';

async function makeRepo(dirs: string[]): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devmap-ms-'));
  for (const d of dirs) await fs.mkdir(path.join(root, d), { recursive: true });
  return root;
}

describe('inferMicroservice', () => {
  it('detects all 8 modules even when some have no domain code', async () => {
    const root = await makeRepo([
      'spring-petclinic-api-gateway/src/main/java',
      'spring-petclinic-customers-service/src/main/java',
      'spring-petclinic-visits-service/src/main/java',
      'spring-petclinic-vets-service/src/main/java',
      'spring-petclinic-genai-service/src/main/java',
      'spring-petclinic-config-server/src/main/resources',
      'spring-petclinic-discovery-server/src/main/resources',
      'spring-petclinic-admin-server/src/main/resources',
      'docker',
      '.mvn',
    ]);
    const services = await detectMicroservices(root);
    expect(services).toEqual([
      'admin-server',
      'api-gateway',
      'config-server',
      'customers-service',
      'discovery-server',
      'genai-service',
      'vets-service',
      'visits-service',
    ]);
  });

  it('maps a Java file path to its microservice', async () => {
    const root = '/tmp/repo';
    const filePath = path.join(
      root,
      'spring-petclinic-visits-service/src/main/java/x/Visit.java',
    );
    expect(microserviceFromPath(root, filePath)).toBe('visits-service');
  });

  it('returns null for files outside any spring-petclinic-* module', () => {
    const root = '/tmp/repo';
    const filePath = path.join(root, 'docker/Dockerfile');
    expect(microserviceFromPath(root, filePath)).toBeNull();
  });

  it('detects all 8 microservices on the real PetClinic repo', async () => {
    const repo = '/Users/hugonienhausen/Desktop/spring-petclinic-microservices';
    try {
      await fs.access(repo);
    } catch {
      return;
    }
    const services = await detectMicroservices(repo);
    expect(services).toHaveLength(8);
    expect(services).toEqual(
      expect.arrayContaining([
        'api-gateway',
        'customers-service',
        'visits-service',
        'vets-service',
        'genai-service',
        'config-server',
        'discovery-server',
        'admin-server',
      ]),
    );
  });
});
