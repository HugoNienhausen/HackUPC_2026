import { describe, it, expect } from 'vitest';
import {
  buildEndpoints,
  extractClassBasePath,
  gatewayPrefix,
  resolveGatewayPath,
} from './endpoints.js';

describe('endpoints — gateway path composition', () => {
  it('gatewayPrefix strips Path= and trailing /** or /*', () => {
    expect(gatewayPrefix(['Path=/api/visit/**'])).toBe('/api/visit');
    expect(gatewayPrefix(['Path=/api/customer/*'])).toBe('/api/customer');
    expect(gatewayPrefix(['Path=/api/genai/**', 'OtherPredicate'])).toBe('/api/genai');
    expect(gatewayPrefix(['NoMatch'])).toBe('');
  });

  it('resolveGatewayPath: visits-service /pets/visits → /api/visit/pets/visits', () => {
    const routes = [{ target: 'visits-service', predicates: ['Path=/api/visit/**'] }];
    expect(resolveGatewayPath('visits-service', '/pets/visits', routes)).toBe(
      '/api/visit/pets/visits',
    );
    expect(resolveGatewayPath('visits-service', '/owners/*/pets/{petId}/visits', routes)).toBe(
      '/api/visit/owners/*/pets/{petId}/visits',
    );
  });

  it('resolveGatewayPath: api-gateway endpoints get null gatewayPath', () => {
    expect(resolveGatewayPath('api-gateway', '/api/gateway/owners/{x}', [])).toBeNull();
  });

  it('resolveGatewayPath: service with no matching route → null', () => {
    expect(resolveGatewayPath('admin-server', '/foo', [])).toBeNull();
  });

  it('extractClassBasePath finds @RequestMapping("/api/gateway") on the class', () => {
    const src = `
      package x;
      @RestController
      @RequestMapping("/api/gateway")
      public class ApiGatewayController { }
    `;
    expect(extractClassBasePath(src)).toBe('/api/gateway');
  });

  it('extractClassBasePath returns empty when no class-level @RequestMapping', () => {
    expect(extractClassBasePath('public class X { }')).toBe('');
  });
});

describe('buildEndpoints', () => {
  it('VisitResource: 3 endpoints with gateway paths under /api/visit', () => {
    const fakeFile = '/tmp/devmap-test-visit-resource.java';
    require('node:fs').writeFileSync(
      fakeFile,
      `package x; @RestController class VisitResource { void f() {} }`,
    );
    const components = [
      {
        id: 'visits.web.VisitResource',
        fqn: 'org.x.VisitResource',
        simpleName: 'VisitResource',
        kind: 'controller' as const,
        microservice: 'visits-service',
        filePath: 'VisitResource.java',
        annotations: ['@RestController'],
        publicMethods: [],
        summary: '',
        core: true,
        loc: 1,
      },
    ];
    const classes = [
      {
        fqn: 'org.x.VisitResource',
        simpleName: 'VisitResource',
        package: 'org.x',
        microservice: 'visits-service',
        sourceFile: fakeFile,
        relativePath: 'VisitResource.java',
        kind: 'controller' as const,
        annotations: ['@RestController'],
        imports: [],
        methods: [
          { name: 'create', signature: 'create(...)', annotations: ['@PostMapping'], httpMethod: 'POST' as const, httpPath: 'owners/*/pets/{petId}/visits', line: 10 },
          { name: 'read', signature: 'read(...)', annotations: ['@GetMapping'], httpMethod: 'GET' as const, httpPath: 'owners/*/pets/{petId}/visits', line: 20 },
          { name: 'read', signature: 'read(...)', annotations: ['@GetMapping'], httpMethod: 'GET' as const, httpPath: 'pets/visits', line: 30 },
        ],
        loc: 60,
        flags: { bootstrap: false, crossCutting: false },
      },
    ];
    const routes = [{ target: 'visits-service', predicates: ['Path=/api/visit/**'] }];
    const out = buildEndpoints({ components, classes, gatewayRoutes: routes });
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.gatewayPath).sort()).toEqual([
      '/api/visit/owners/*/pets/{petId}/visits',
      '/api/visit/owners/*/pets/{petId}/visits',
      '/api/visit/pets/visits',
    ]);
    expect(out.every((e) => e.componentId === 'visits.web.VisitResource')).toBe(true);
  });
});
