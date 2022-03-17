// TODO move in vite-plugin-ssr
import '@vercel/node';
import { prerender as prerenderCli } from 'vite-plugin-ssr/cli';
import path from 'path';
import fs from 'fs/promises';
import { normalizePath, Plugin, ResolvedConfig, UserConfig } from 'vite';
import { PageContextBuiltIn } from 'vite-plugin-ssr';
import {
  ViteVercelApiEntry,
  ViteVercelPrerenderFn,
  ViteVercelPrerenderRoute,
} from 'vite-plugin-vercel';
import { newError } from '@brillout/libassert';
import { GlobalContext } from 'vite-plugin-ssr/dist/cjs/node/renderPage';

const libName = 'vite-plugin-ssr:vercel';
const ssrEndpointDestination = 'api/ssr_';
const isrEndpointDestination = 'ssr_';

export function assert(
  condition: unknown,
  errorMessage: string,
): asserts condition {
  if (condition) {
    return;
  }

  const err = newError(`[${libName}][Wrong Usage] ${errorMessage}`, 2);
  throw err;
}

interface PageContext extends PageContextBuiltIn, GlobalContext {
  _prerenderResult: {
    filePath: string;
    fileContent: string;
  };
}

export function getRoot(config: UserConfig | ResolvedConfig): string {
  return normalizePath(config.root || process.cwd());
}

export function getOutDir(
  config: ResolvedConfig,
  force?: 'client' | 'server',
): string {
  const p = normalizePath(config.build.outDir);
  if (!force) return p;
  return path.join(path.dirname(p), force);
}

export const prerender: ViteVercelPrerenderFn = async (
  resolvedConfig: ResolvedConfig,
) => {
  const routes: NonNullable<ViteVercelPrerenderRoute> = {};
  const prerenderedPages: string[] = [];
  let globalContext: GlobalContext | undefined = undefined;
  const isrPagesWhitelist: string[] = Object.keys(
    resolvedConfig.vercel?.prerenderManifest?.routes ?? [],
  );

  await prerenderCli({
    root: getRoot(resolvedConfig),
    noExtraDir: true,
    async onPagePrerender(pageContext: PageContext) {
      if (!globalContext) {
        // TODO use getGlobalContext when moving into vite-plugin-ssr
        globalContext = pageContext as unknown as GlobalContext;
      }

      assert(
        typeof pageContext.pageExports.initialRevalidateSeconds === 'number' ||
          typeof pageContext.pageExports.initialRevalidateSeconds ===
            'undefined',
        ` \`{ initialRevalidateSeconds }\` must be a number`,
      );

      const { filePath } = pageContext._prerenderResult;
      const newFilePath = path.join(
        getRoot(resolvedConfig),
        '.output/server/pages',
        path.relative(getOutDir(resolvedConfig, 'client'), filePath),
      );

      if (
        isrPagesWhitelist.includes(pageContext.url) ||
        pageContext.pageExports.initialRevalidateSeconds
      ) {
        if (!routes.isr) {
          routes.isr = { routes: {} };
        }
        if (!routes.isr.routes) {
          routes.isr.routes = {};
        }

        routes.isr.routes[pageContext.url] = {
          srcRoute: '/' + isrEndpointDestination,
          initialRevalidateSeconds:
            pageContext.pageExports.initialRevalidateSeconds === 0
              ? resolvedConfig.vercel?.initialRevalidateSeconds
              : pageContext.pageExports.initialRevalidateSeconds,
        };
      }

      prerenderedPages.push(pageContext.url);

      await fs.mkdir(path.dirname(newFilePath), { recursive: true });
      await fs.writeFile(newFilePath, pageContext._prerenderResult.fileContent);
    },
  });

  // Compute data for dynamic ssr pages (routes-manifest)
  const ssrPages = globalContext!._pageRoutes
    .map((p) => p.filesystemRoute)
    .filter((p) => !prerenderedPages.includes(p));
  if (ssrPages.length > 0) {
    if (!routes.ssr) {
      routes.ssr = { rewrites: [] };
    }
    if (!routes.ssr.rewrites) {
      routes.ssr.rewrites = [];
    }

    const rewrites = resolvedConfig.vercel?.routesManifest?.rewrites ?? [];

    for (const route of ssrPages) {
      // can be overriden by user config or another plugin
      const overrideRewrite = rewrites.find((r) => r.source === route);

      routes.ssr.rewrites.push({
        source: route,
        destination: '/' + ssrEndpointDestination,
        // TODO not sure that .* should be there
        regex: '^' + route + '.*$',
        ...overrideRewrite,
      });
    }
  }

  return routes;
};

export async function getSsrEndpoint(
  resolvedConfig: UserConfig,
  source?: string,
): Promise<ViteVercelApiEntry> {
  const sourcefile =
    source ?? path.join(__dirname, 'templates', 'ssr_.template.ts');
  const contents = await fs.readFile(sourcefile, 'utf-8');
  const destination = [ssrEndpointDestination, isrEndpointDestination];

  const importBuildPath = path.join(
    getRoot(resolvedConfig),
    'dist/server/importBuild',
  );
  const resolveDir = path.dirname(sourcefile);
  const relativeImportBuildPath = path.relative(resolveDir, importBuildPath);

  return {
    source: {
      contents: `import '${relativeImportBuildPath}';\n` + contents,
      sourcefile,
      loader: sourcefile.endsWith('.ts')
        ? 'ts'
        : sourcefile.endsWith('.tsx')
        ? 'tsx'
        : sourcefile.endsWith('.js')
        ? 'js'
        : sourcefile.endsWith('.jsx')
        ? 'jsx'
        : 'default',
      resolveDir,
    },
    destination,
  };
}

export function vitePluginSsrVercelPlugin(): Plugin {
  return {
    name: libName,
    apply: 'build',
    async config(userConfig): Promise<UserConfig> {
      return {
        vercel: {
          prerender: userConfig.vercel?.prerender ?? prerender,
          additionalEndpoints: [await getSsrEndpoint(userConfig)],
        },
      };
    },
  } as Plugin;
}