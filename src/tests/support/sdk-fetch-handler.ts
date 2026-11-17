/**
 * A Smithy request handler over an injected `fetch`, for tests: the generated client serialises the
 * real request (method, path with labels, headers, JSON body) and the fake `fetch` answers it, so a
 * test exercises the SDK's actual wire format and error parsing without the network.
 */
import { HttpResponse, type HttpRequest } from '@smithy/protocol-http';

export function fetchHandler(fetchImpl: typeof fetch) {
  return {
    async handle(request: HttpRequest) {
      const query = new URLSearchParams(
        Object.entries(request.query ?? {}).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((x) => [k, x]) : v == null ? [] : [[k, v]]
        )
      ).toString();
      const port = request.port ? `:${request.port}` : '';
      const url = `${request.protocol}//${request.hostname}${port}${request.path}${query ? `?${query}` : ''}`;
      const res = await fetchImpl(url, {
        method: request.method,
        headers: request.headers,
        body: request.body as BodyInit | undefined,
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      return {
        response: new HttpResponse({
          statusCode: res.status,
          headers,
          body: new Uint8Array(await res.arrayBuffer()),
        }),
      };
    },
    updateHttpClientConfig() {},
    httpHandlerConfigs: () => ({}),
  };
}
