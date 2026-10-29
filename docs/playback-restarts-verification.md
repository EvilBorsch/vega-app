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

## Installable fork build: 5.3.0-fixes.1

The signed release APK was built successfully and installed as `com.vega` on the connected arm64 Android phone, replacing the official 5.2.2 installation with the user's authorization. Android reported versionName `5.3.0-fixes.1`, versionCode 214. The settings/library export and shared-folder sync history were verified before removal; no old APK/build archive was created.

APK SHA-256: `60e41434fbc82193b0ac384ba69fc12b18e98a3d0783af71de2b494c7b3a2c80`.

The APK includes automatic first-launch setup of the Zenda-Cross source and Torrentio. It fetches the current provider modules through the existing installer, needs internet on first setup, preserves legacy source migration, retries a failed setup on a later launch, and respects later removal. It does not embed a TV IP or the user's provider credentials. Torrent resume matching now tolerates live seeder-count changes by comparing the torrent hash.

All 90 tests in nine targeted suites pass, as does TypeScript. The complete suite has 141 passing suites and the same nine failing baseline suites (1,043 passing tests, two failing tests). The APK's packaged source map was checked against the current App, ExtensionManager and remembered-server sources.

UPnP 601 means an argument is outside the renderer's allowed values; it is distinct from transition error 701. A regression test verifies that 601 is preserved without applying the 701 retry. No separate 601 root cause has yet been reproduced.

Post-install UI setup, data restoration and full-app DLNA checks are pending an unlocked phone and a reachable LG. The physical results above belong to the earlier diagnostic-process checks, not the newly installed full APK.
