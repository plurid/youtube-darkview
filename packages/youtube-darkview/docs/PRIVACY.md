# Privacy posture

What the extension knows, where it goes, and what each planned stage changes. The promise
made by the shipped v1.0.x and kept by Stage 1: **nothing about the user or their watching
leaves the browser.**

## Today (v1.0.x, shipped)

- The only permission is `storage`, holding one small preferences object
  (`mode`, `sensitivity`, `intensity`) in `chrome.storage.local`.
- No network requests of any kind. No analytics, no telemetry, no error reporting.
- Video frames are read on-device to compute the inversion and are never stored or
  transmitted. Activation state is per-page and ephemeral.

## Stage 1 — local storyboard maps (planned; posture unchanged)

Stage 1 adds fetches of the YouTube watch page and `i.ytimg.com` storyboard sprites — both
requests to YouTube's own infrastructure, made from the user's browser in the context of a
video the user is actively watching, indistinguishable in kind from what the player itself
does when scrubbing. No third party is contacted; nothing is transmitted outward. Computed
analyses are cached in `chrome.storage.local` (derived numbers about public video content,
capped at 40 entries, expiring after 8 hours) — local to the browser profile like every
other extension setting. The extension's permission surface does not change.

Summary: after Stage 1 the privacy statement above remains true, word for word.

## Stage 2 — community map service (not committed; what it would change)

Fetching or submitting shared maps means telling a plurid-operated server *which video* the
user is watching. A video id is watch activity — this is the single meaningful privacy cost
of the entire design, and it is handled as follows:

- **Opt-in only, default off.** The default install keeps the zero-network posture; the
  feature is a popup toggle with plain-language explanation of exactly what is sent.
- **Runtime-optional permission.** The API host is declared under
  `optional_host_permissions` and requested via `chrome.permissions.request` at opt-in,
  so even the installed permission surface stays minimal until consent.
- **No identity.** Requests carry no account, no cookie, no client identifier. Submitted
  maps contain only derived numbers about public video content
  (see [MAP_FORMAT.md](./MAP_FORMAT.md) — "A map contains no user data").
- **Minimal retention.** Server logs are limited to operational counters; no request-level
  watch history is kept.

## Draft store policy language (for when Stage 2 ships)

> YouTube Darkview processes video frames entirely on your device to render its dark-view
> effect; frames are never stored or transmitted. Your preferences are kept in Chrome's
> extension storage. If you enable the optional community maps feature, the extension
> contacts the darkview maps service to fetch or contribute analysis metadata for the
> public video you are watching; these requests contain the video's public identifier and
> the derived analysis data, and no account, cookie, or other identifier. With the feature
> disabled (the default), the extension makes no requests to any service.

## Review checklist for any future change

1. Does it add a network destination? → It must be reflected here, in both READMEs, and in
   the store listing's privacy disclosures before shipping.
2. Does it transmit anything derived from watching? → Opt-in, default off, documented.
3. Could the data identify a person or their history? → Redesign until it cannot.
