import { describe, it, expect } from 'vitest';
import {
  extractHttpEdgesFromFile,
  extractDiscoveryEdgesFromFile,
  extractGatewayRoutesFromYaml,
  extractImportEdges,
} from './edges.js';

describe('edges — HTTP service URL extraction', () => {
  it('snippet 1: literal http://service inside method body matches', () => {
    const java = `package x;
class Client {
  void run() {
    builder.uri("http://customers-service/owners/{ownerId}", ownerId);
  }
}`;
    const edges = extractHttpEdgesFromFile(java, 'api-gateway', 'Client.java');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: 'api-gateway',
      to: 'customers-service',
      type: 'http',
    });
  });

  it('snippet 2: lb://service-name (Spring Cloud LB scheme) inside method body matches', () => {
    const java = `class Foo { void m() { String url = "lb://vets-service/api"; } }`;
    const [edge] = extractHttpEdgesFromFile(java, 'api-gateway', 'Foo.java');
    expect(edge?.to).toBe('vets-service');
  });

  it('snippet 3: class-level field constant is SKIPPED at depth 1 (heuristic 2b)', () => {
    const java = `class C {
  private String hostname = "http://visits-service/";
  void m() { var x = hostname; }
}`;
    const edges = extractHttpEdgesFromFile(java, 'api-gateway', 'C.java');
    expect(edges).toHaveLength(0);
  });

  it('snippet 4: URL inside a // comment is stripped before scan (heuristic 2a)', () => {
    const java = `class C { void m() { /* "http://customers-service/x" */ var y = 1; // also http://vets-service
  } }`;
    const edges = extractHttpEdgesFromFile(java, 'api-gateway', 'C.java');
    expect(edges).toHaveLength(0);
  });

  it('snippet 5: same-service self-reference is filtered out', () => {
    const java = `class C { void m() { var x = "http://api-gateway/internal"; } }`;
    const edges = extractHttpEdgesFromFile(java, 'api-gateway', 'C.java');
    expect(edges).toHaveLength(0);
  });

  it('snippet 6: multiple URLs in one file produce one edge each, with correct lines', () => {
    const java = `package x;
class C {
  void a() {
    builder.uri("http://customers-service/x");
  }
  void b() {
    String s = "http://vets-service/y";
  }
}`;
    const edges = extractHttpEdgesFromFile(java, 'genai-service', 'C.java');
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.to).sort()).toEqual([
      'customers-service',
      'vets-service',
    ]);
    expect(edges[0]!.sourceLine).toBeGreaterThan(0);
  });

  it('discoveryClient.getInstances("name") emits a discovery edge', () => {
    const java = `class C { void m() {
  return discoveryClient.getInstances("customers-service").get(0).getUri();
} }`;
    const edges = extractDiscoveryEdgesFromFile(java, 'genai-service', 'C.java');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: 'genai-service',
      to: 'customers-service',
      type: 'discovery',
    });
  });
});

describe('edges — gateway YAML routes', () => {
  it('parses spring.cloud.gateway.server.webflux.routes[] into one edge per route', () => {
    const yaml = `spring:
  cloud:
    gateway:
      server:
        webflux:
          routes:
            - id: vets-service
              uri: lb://vets-service
              predicates:
                - Path=/api/vet/**
            - id: visits-service
              uri: lb://visits-service
              predicates:
                - Path=/api/visit/**
            - id: customers-service
              uri: lb://customers-service
              predicates:
                - Path=/api/customer/**
            - id: genai-service
              uri: lb://genai-service
              predicates:
                - Path=/api/genai/**
`;
    const routes = extractGatewayRoutesFromYaml(yaml);
    expect(routes.map((r) => r.target).sort()).toEqual([
      'customers-service',
      'genai-service',
      'vets-service',
      'visits-service',
    ]);
    const v = routes.find((r) => r.target === 'visits-service');
    expect(v?.predicates).toEqual(['Path=/api/visit/**']);
  });

  it('handles multi-doc yaml (--- separator) without crashing', () => {
    const yaml = `spring:
  application:
    name: api-gateway
---
spring:
  config:
    activate: { on-profile: docker }
`;
    expect(extractGatewayRoutesFromYaml(yaml)).toEqual([]);
  });
});

describe('edges — intra-service import edges', () => {
  it('emits an import edge between two classes in the same microservice', () => {
    const classes = [
      {
        fqn: 'a.b.Caller',
        simpleName: 'Caller',
        package: 'a.b',
        microservice: 'visits-service',
        sourceFile: '/x/Caller.java',
        relativePath: 'Caller.java',
        kind: 'controller' as const,
        annotations: [],
        imports: ['a.b.Callee'],
        methods: [],
        loc: 10,
        flags: { bootstrap: false, crossCutting: false },
      },
      {
        fqn: 'a.b.Callee',
        simpleName: 'Callee',
        package: 'a.b',
        microservice: 'visits-service',
        sourceFile: '/x/Callee.java',
        relativePath: 'Callee.java',
        kind: 'repository' as const,
        annotations: [],
        imports: [],
        methods: [],
        loc: 10,
        flags: { bootstrap: false, crossCutting: false },
      },
    ];
    const edges = extractImportEdges(classes);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: 'visits-service',
      to: 'visits-service',
      type: 'import',
    });
  });
});
