import { ResolvedConfig } from 'vite';
import {
  FunctionsManifest,
  PrerenderManifest,
  PrerenderManifestDynamicRoute,
  PrerenderManifestRoute,
  RoutesManifest,
  ViteVercelPrerenderRoute,
} from './types';
import path from 'path';
import { getOutput } from './utils';
import { assert } from './assert';
import { routesManifestSchema } from './schemas/manifests/routes';
import { functionsManifestSchema } from './schemas/manifests/functions';
import { prerenderManifestSchema } from './schemas/manifests/prerender';

// Prerender manifest

export function getPrerenderManifest(
  resolvedConfig: ResolvedConfig,
  isrPages: ViteVercelPrerenderRoute['isr'],
): PrerenderManifest {
  const prerenderManifestDefault = resolvedConfig.vercel?.prerenderManifest;

  const routes = Object.entries(isrPages?.routes ?? {}).reduce(
    (acc, [key, val]) => {
      const srcRoute =
        val?.srcRoute ?? prerenderManifestDefault?.routes?.[key]?.srcRoute;

      assert(
        typeof srcRoute === 'string',
        `\`[prerender-manifest] { srcRoute }\` is required for route ${key}`,
      );

      acc[key === '/' ? '/index' : key] = {
        initialRevalidateSeconds:
          val?.initialRevalidateSeconds ??
          prerenderManifestDefault?.routes?.[key]?.initialRevalidateSeconds ??
          resolvedConfig.vercel?.initialRevalidateSeconds ??
          86400,
        srcRoute: srcRoute,
        dataRoute:
          val?.dataRoute ??
          prerenderManifestDefault?.routes?.[key]?.dataRoute ??
          '',
      };
      return acc;
    },
    {} as Record<string, PrerenderManifestRoute>,
  );

  const dynamicRoutes = Object.entries(isrPages?.dynamicRoutes ?? {}).reduce(
    (acc, [key, val]) => {
      const override = prerenderManifestDefault?.dynamicRoutes?.[key];
      const routeRegex = val?.routeRegex ?? override?.routeRegex;

      const fallback =
        val?.fallback === null || typeof val?.fallback === 'string'
          ? val?.fallback
          : override?.fallback === null ||
            typeof override?.fallback === 'string'
          ? override?.fallback
          : null;

      assert(
        routeRegex,
        `\`[prerender-manifest] { routeRegex }\` is required for route ${key}`,
      );

      acc[key] = {
        routeRegex,
        fallback,
        dataRoute: val?.dataRoute ?? override?.dataRoute ?? '',
        dataRouteRegex: val?.dataRouteRegex ?? override?.dataRouteRegex ?? '',
      };

      return acc;
    },
    {} as Record<string, PrerenderManifestDynamicRoute>,
  );

  return prerenderManifestSchema.parse({
    version: 3,
    routes,
    dynamicRoutes,
    preview: {
      previewModeId: prerenderManifestDefault?.preview?.previewModeId ?? null,
    },
  });
}

export function getPrerenderManifestDestination(
  resolvedConfig: ResolvedConfig,
) {
  return path.join(getOutput(resolvedConfig), 'prerender-manifest.json');
}

// Routes manifest

export function getRoutesManifest(
  resolvedConfig: ResolvedConfig,
  ssr: ViteVercelPrerenderRoute['ssr'],
): RoutesManifest {
  const routesManifest = resolvedConfig.vercel?.routesManifest;

  const allRewrites: NonNullable<RoutesManifest['rewrites']> = [
    ...(ssr?.rewrites ?? []),
    ...(routesManifest?.rewrites ?? []),
  ];

  const allDynamicRoutes: NonNullable<RoutesManifest['dynamicRoutes']> = [
    ...(ssr?.dynamicRoutes ?? []),
    ...(routesManifest?.dynamicRoutes ?? []),
  ];

  const allHeaders: NonNullable<RoutesManifest['headers']> = [
    ...(ssr?.headers ?? []),
    ...(routesManifest?.headers ?? []),
  ];

  return routesManifestSchema.parse({
    version: 3,
    basePath: routesManifest?.basePath ?? '/',
    pages404: routesManifest?.pages404 ?? true,
    dynamicRoutes: allDynamicRoutes.length > 0 ? allDynamicRoutes : undefined,
    rewrites: allRewrites.length > 0 ? allRewrites : undefined,
    redirects: routesManifest?.redirects,
    headers: allHeaders.length > 0 ? allHeaders : undefined,
  });
}

export function getRoutesManifestDestination(resolvedConfig: ResolvedConfig) {
  return path.join(getOutput(resolvedConfig), 'routes-manifest.json');
}

// Functions manifest

export function getFunctionsManifest(
  pages: FunctionsManifest['pages'],
): FunctionsManifest {
  return functionsManifestSchema.parse({
    version: 1,
    pages,
  });
}

export function getFunctionsManifestDestination(
  resolvedConfig: ResolvedConfig,
) {
  return path.join(getOutput(resolvedConfig), 'functions-manifest.json');
}
