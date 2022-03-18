import { routesManifestSchema } from 'vite-plugin-vercel/src/schemas/manifests/routes';
import {
  prepareTestJsonFileContent,
  testFileExists,
  testSchema,
} from '../helpers';

describe('routes-manifest.json - pre tests', function () {
  testFileExists('.output/routes-manifest.json');
});

prepareTestJsonFileContent('.output/routes-manifest.json', (context) => {
  testSchema(context, routesManifestSchema);

  it('should have no rewrites, headers, redirects, or dynamicRoutes', function () {
    expect(context.file).not.toHaveProperty('rewrites');
    expect(context.file).not.toHaveProperty('headers');
    expect(context.file).not.toHaveProperty('redirects');
    expect(context.file).not.toHaveProperty('dynamicRoutes');
  });
});
