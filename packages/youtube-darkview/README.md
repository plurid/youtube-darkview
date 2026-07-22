# YouTube Darkview

YouTube Darkview is a Chrome extension for making bright presentation slides, diagrams, and screen recordings more comfortable to watch without blindly transforming every frame.

## How it works

Press **Alt/Option + D** on a YouTube page or use the popup to activate Darkview. Activation belongs to that page only: it is not a browser-wide shortcut and it is not persisted across pages. Preferences are shared through extension storage.

- **Content-aware** mode watches each frame and stays completely out of the way while the picture is already dark. When a frame is dominated by light background it redraws the video onto an overlay canvas and inverts the light regions: backgrounds and text flip to dark while colored pixels - faces, photos, diagrams, accents - always keep their original colors, even at region edges. Rendering follows the video's own frame presentation, at most about 30 frames per second, and pauses with the video and with hidden tabs.
- **Invert** mode inverts the whole video with a CSS filter.
- **Sensitivity** controls how white a region must be before it is inverted.
- **Intensity** controls how bright the inverted regions remain.

If Chrome prevents canvas access, content-aware mode falls back to whole-video inversion for the current video. The extension does not send video frames or usage data anywhere.

## Scope and permissions

The content script runs only on YouTube. The manifest requests only the `storage` permission; it has no background service, remote code, analytics, or network permission. **Alt/Option + D is handled inside each YouTube page**, so one tab cannot toggle another. The shortcut is ignored while typing in the search box, comments, or any other text field.

## Development

Requirements:

- Node.js 24 or newer
- pnpm 11.6.0

```sh
cd packages/youtube-darkview
pnpm install --frozen-lockfile
pnpm check
```

The TypeScript target is ES2024. `pnpm check` validates peer dependencies, formatting/linting, strict types, coverage thresholds, the production Webpack build, the manifest/package file allowlist, bundle budgets, and the Chrome Web Store archive.

Useful commands:

```sh
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm package
```

The unpacked extension is written to `distribution/`; the versioned store archive is written to `distribution-zip/`.

To test locally, run `pnpm build`, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `packages/youtube-darkview/distribution`.
