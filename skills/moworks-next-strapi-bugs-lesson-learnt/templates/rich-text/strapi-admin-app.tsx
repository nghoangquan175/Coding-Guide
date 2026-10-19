/**
 * `backend/src/admin/app.tsx` — the CKEditor part only. Galambila's real file
 * also registers a side panel, flips the boolean toggles and stamps QA test
 * ids; those are separate concerns and are left out here.
 *
 * Plugin: `@_sh/strapi-plugin-ckeditor` (plugin id `ckeditor5`), enabled in
 * `config/plugins.ts` with `ckeditor5: { enabled: true }`. NOT the official
 * `@ckeditor/strapi-plugin-ckeditor` — that one loads from CKEditor's CDN and
 * wants a licence key. This one bundles via npm with `licenseKey: 'GPL'`.
 *
 * Schema side, per field:
 *   "body": {
 *     "type": "richtext",
 *     "customField": "plugin::ckeditor5.CKEditor",
 *     "options": { "preset": "defaultHtml" }   // or "inlineHtml"
 *   }
 */
import {
  defaultHtmlPreset,
  defaultMarkdownPreset,
  setPluginConfig,
} from "@_sh/strapi-plugin-ckeditor";

/**
 * A one-line rich text editor for fields that are one sentence that may hold a
 * link (footer copyright, a thank-you line). Same HTML output as `defaultHtml`,
 * toolbar cut to bold / italic / link.
 *
 * `plugins` is NOT trimmed — that would drop paste handling and autoformat.
 * The frontend sanitizer is the backstop for what may render.
 *
 * Height: override the plugin's CSS variable. Its theme sets
 * `--ck-editor-min-height: 200px` and applies it with `!important`, so a plain
 * `min-height` rule does nothing. Re-check the variable name after an upgrade.
 */
const inlineHtmlPreset = {
  name: "inlineHtml",
  description: "One line of rich text — bold, italic and links",
  editorConfig: {
    ...defaultHtmlPreset.editorConfig,
    toolbar: ["bold", "italic", "link", "|", "removeFormat", "|", "undo", "redo"],
  },
  styles: `
    .ck {
      --ck-editor-min-height: 130px;
    }
  `,
};

export default {
  config: {
    locales: [],
  },
  register() {
    // In `register`, once — the plugin's config is immutable after the first
    // call. It REPLACES the preset list, so the two defaults are passed back.
    setPluginConfig({
      presets: [defaultHtmlPreset, defaultMarkdownPreset, inlineHtmlPreset],
      theme: undefined,
    });
  },
};
