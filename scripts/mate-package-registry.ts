import path from "node:path";

export const MATE_PACKAGE_NAME = "bb-plugin-mate";
export const MATE_PACKAGE_VERSION = "0.1.0-alpha.1";

export function createMateRegistryDocument(args: {
  baseUrl: string;
  integrity: string;
  shasum: string;
}): Record<string, unknown> {
  const tarball = `${args.baseUrl}/${MATE_PACKAGE_NAME}/-/${MATE_PACKAGE_NAME}-${MATE_PACKAGE_VERSION}.tgz`;
  return {
    name: MATE_PACKAGE_NAME,
    "dist-tags": { latest: MATE_PACKAGE_VERSION },
    versions: {
      [MATE_PACKAGE_VERSION]: {
        name: MATE_PACKAGE_NAME,
        version: MATE_PACKAGE_VERSION,
        license: "MIT",
        engines: { bb: ">=0.36", bbPluginSdk: "^0.4.1" },
        dist: { integrity: args.integrity, shasum: args.shasum, tarball },
      },
    },
  };
}

export function startMatePackageRegistry(args: {
  artifactPath: string;
  integrity: string;
  shasum: string;
}): { baseUrl: string; stop(): void } {
  let baseUrl = "";
  const tarballPath = `/${MATE_PACKAGE_NAME}/-/${MATE_PACKAGE_NAME}-${MATE_PACKAGE_VERSION}.tgz`;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (request.method === "GET" && pathname === `/${MATE_PACKAGE_NAME}`) {
        return Response.json(
          createMateRegistryDocument({
            baseUrl,
            integrity: args.integrity,
            shasum: args.shasum,
          }),
        );
      }
      if (request.method === "GET" && pathname === tarballPath) {
        return new Response(Bun.file(path.resolve(args.artifactPath)), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
  return { baseUrl, stop: () => server.stop(true) };
}
