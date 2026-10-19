import { mergeConfig, type UserConfig } from 'vite';

/**
 * The CKEditor 5 field (`@_sh/strapi-plugin-ckeditor`) is lazy-loaded —
 * Strapi's custom-field API registers its input as `async () => import(...)`,
 * same as every other custom field — so it and everything it pulls in
 * (`ckeditor5` itself, `fuzzysort` via `ckeditor5-emoji`, `extend`, and
 * whatever else it depends on transitively) are outside Vite's cold-start
 * dependency scan, which only crawls what the initial page load reaches
 * statically. Vite CAN discover a dependency on demand instead, but that path
 * has repeatedly failed to add CJS interop correctly for some of these older,
 * `exports`-map-less packages — "The requested module '.../fuzzysort.js'
 * does not provide an export named 'default'", then the same for `extend`,
 * served raw via `@fs` instead of pre-bundled. Each was a real, separate
 * package once discovered — not a typo to fix once — so instead of pinning
 * them one at a time as they surface, `optimizeDeps.include` tells Vite about
 * the whole `ckeditor5` bundle up front, which pulls its own dependency graph
 * in with it.
 */
export default (config: UserConfig) => {
  return mergeConfig(config, {
    optimizeDeps: {
      include: ['ckeditor5', '@ckeditor/ckeditor5-react'],
    },
  });
};
