# Casting restarts and server selection implementation plan

**Goal:** repeated casting works across stop/reload and movies use explicit server selection or the remembered server.

**Architecture:** retain the native FFmpeg delivery server, DLNA service, stream hook and existing progress storage. Add only source identity persistence and a pre-play chooser.

**Spec:** ../specs/2026-10-29-playback-restarts-design.md

- [x] Capture installed-release receiver failures; compare affected code with main.
- [x] Add failing DLNA regressions in __tests__/dlnaPolling.test.ts for stop-before-URI, 701 recovery and cancellation; repair src/lib/remote/dlnaService.ts.
- [x] Add stream-hook regressions for Play waiting, Resume matching, missing remembered server, provider isolation and refreshed URLs; persist server identity and connect a chooser in Player/SeasonList.
- [x] Exercise FFmpeg startup/close races and repair native-src/android/com/vega/FFmpegMp4Packager.kt, with native lifecycle regression coverage.
- [x] Run targeted tests, the project suite, TypeScript and appropriate native build checks; record unrelated failures.
- [x] Review the final diff, commit and push the authorized fork branch; record exact verification limits in docs/playback-restarts-verification.md.

Review focus: canceled startup, repeated loads, stale receiver callbacks, same-named servers with different quality/tags, missing remembered sources, local media startup, expired provider URLs.
