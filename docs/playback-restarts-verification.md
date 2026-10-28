# Playback restart verification — 2026-10-29

## Changes

- Movie Play waits for a server choice before resolving a torrent. Resume restores a persisted server identity using fresh provider results and the existing saved position. Missing servers require a new choice. Signed URLs and headers are not persisted.
- DLNA stops the transport before URI replacement and retries transition fault 701 once. Cancellation is checked between network operations.
- FFmpeg uses an anonymous pipe instead of blocking named-FIFO opens. Startup ownership, queued cancellation, descriptor lifetime, prebuffering on the phone and a bounded readiness wait cover repeated/canceled loads.
- Old asynchronous Cast delivery errors cannot overwrite a newer playback session.

## Automated verification

`npx tsc --noEmit` and Android `:app:compileDebugKotlin -PreactNativeArchitectures=arm64-v8a` pass.

`scripts/test-remux-pipe.ps1` checks no-writer startup, genuine EOF, failure reporting, timeout and concurrent close. It uses the Kotlin compiler from the Gradle cache; run the Android compile first to populate it.

All 69 tests in seven targeted playback suites pass, including shared React Query cache reopening, disappeared torrents with identical server names, refreshed signed URLs, warmup ordering/cancellation, stale Cast errors and DLNA 701 sequencing.

The full upstream test suite has nine failing suites on Windows. They also fail on the unchanged upstream commit: `Extensions`, `watchWhileDownloading`, `SeasonList`, `searchResultsProviders`, `downloadsLocalContent`, `DownloadBottomSheet`, `IconButton`, `downloadId`, `App`. Failures include missing native mocks/CSS handling and platform-dependent filename expectations. No new failing suite was introduced.

## Physical device evidence and limits

The installed Vega 5.2.2 reproduced both LG fault 701 and the Chromecast named-pipe timeout after 25 seconds on a repeated playback attempt.

The fork's native packager was compiled against its actual FFmpegKit dependency and run in a separate ADB diagnostic process on the connected Android phone. Using that phone-hosted stream, the Haier Chromecast passed three consecutive stop/prepare/play cycles of the same movie at the 405.405-second source position. Preparation took 9.70, 10.78 and 10.83 seconds; receiver status was PLAYING and its timeline advanced each time. This validates the native delivery path, not installation of the complete forked APK.

Canceling a separate cold warmup at 3500 seconds released the waiting HTTP request in 0.5 seconds with Stream Closed; the next run can start without waiting for the cold source.

An additional cold seek to 900 seconds failed because the phone's torrent server could not obtain piece 185 and returned HTTP 503. The fork reports the unavailable media before giving the TV a broken URL. Peer availability remains an external constraint; a longer buffering budget cannot guarantee unavailable torrent pieces.

After the user restored the LG's network availability, the LG webOS UK6200PLA passed three consecutive stop/prepare/play cycles using the same phone-hosted native stream. The fork's actual TypeScript DLNA service was bundled into a diagnostic client with SOAP calls at the native boundary. Every cycle reached PLAYING; observed receiver positions advanced from 1 to 4, 2 to 4, and 1 to 4 seconds respectively. No 701 error occurred in these three cycles. The deterministic regression test separately exercises the bounded 701 retry.

These are short restart checks, not full-film soak tests. They cover the 23.98 GB Rutracker source at 405.405 seconds; the separate 2.74 GB release was not independently exercised. Receiver checks used the updated native delivery and DLNA sequencing, but not the complete replacement application's UI.

No complete replacement APK was installed over the user's app and no previous APK/build archive was created.
