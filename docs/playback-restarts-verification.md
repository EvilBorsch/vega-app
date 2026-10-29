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

## Later fixes found on the installed APK (fixes.2 – fixes.7)

- **History restore.** Android Downloads returns opaque `msd:`/`msf:` document URIs that Expo's legacy file reader cannot open, so imported history was ignored. `SyncStorageModule.readManifest` reads through the ContentResolver. The restored history appeared on Home on the phone.
- **Source menu.** Quality and language filters (OR within a group, AND across groups; *Unspecified* keeps unlabeled sources), cards with a separate seeder badge, and a dialog sized to the screen. In landscape the filters sit in a left column; on the phone 1080p + RU reduced 50 sources to 3. The selected card's title now uses `onSecondaryContainer`, so it stays legible on the light poster palette.
- **Failed movie torrents.** A failed torrent reopens the server choice instead of silently switching to a different quality. Resume keeps the user's last choice.
- **FFmpeg stall on HTTP reuse.** `TorrentStreamServer` forced `Connection: keep-alive` even when the client asked to close. FFmpeg reused the closed socket, lost the MKV Cues and scanned from the start to the resume point. `scripts/check-torrent-http.py` failed on fixes.2 and passes on fixes.3; the MP4 header now appears 0.1–0.2 s after remux starts.
- **LG Play timeout.** The LG starts playback but can answer SOAP `Play` after more than 8 s. `Play` alone gets a 30 s read timeout.
- **Late Chromecast status during DLNA.** Cast SDK status is ignored while DLNA or Vega Cast is active.
- **Native crash on retrying a torrent (SIGSEGV).** `AddTorrentAlert.handle()` wraps a non-owning pointer into alert storage that libtorrent recycles. TorrentModule cached it, and after a metadata timeout the next `addTorrent` of the same hash called `status()` on freed memory. An on-device libtorrent4j harness (`app_process`) reproduced it: alert handle 2 × SIGSEGV + 4 × stale `valid=false` in 6 runs, owned session handle 6/6 correct. Only `sm.find()` handles are cached now. A retry after a timeout no longer crashes. Because `download()` ignores a torrent already in the session, the retry also checks whether metadata arrived before its listener was registered.
- **Stale URL after a server switch while casting.** The cast effect ran in the render after the switch with the previous torrent's `processedStreamUrl`, which is reset only after the old torrent is removed. The receiver was handed the old URL and got 404 ("Video processing failed"). `isRemoteSourceReady` requires the URL to be resolved for the selected stream; `remoteSourceReady.test.ts` failed before the change. On the phone a server switch during LG playback no longer issues a load; the TV keeps playing until the new source is ready.
- **No peers on the fixed BitTorrent ports.** The session listened on 6881/6891. On this network every UDP tracker announce from the app timed out and the DHT stalled at 2 nodes, while the same libtorrent build on another port found peers. A diagnostics log (metadata-wait status every 5 s, listen/tracker/DHT alerts) showed it in the app. With a system-chosen port the same magnet got tracker replies with 117–149 peers and metadata in 1.0 s on two consecutive cold starts (eight consecutive failures before), and downloads reached 10.4 MB/s. After about ten minutes of streaming, UDP announces on the new port timed out too, while established peer connections kept downloading. The network appears to block UDP on a port after detecting BitTorrent. A new torrent in a long session may therefore need an app restart; this is a network limit, not something the app can fix.

## Verification on 5.3.0-fixes.7 (installed, 2026-10-29)

APK SHA-256: `fa28bd00196b6e8e5424122e5c4deb3b1fdb55b30cad12ba38babf9d6fadc0eb`, versionCode 217, signed with the same local key as earlier fork builds (installs over them without data loss).

LG webOS UK6200PLA, The Whale, 1080p WEB-DL MP4 (2.15 GB, 167 seeders), all through the app UI with a separate SOAP observer (GetTransportInfo/GetPositionInfo only):

| Cycle | Path | LG state | Start position |
|---|---|---|---|
| 1 | Resume → Cast → LG | PLAYING after 8 s, position advancing | 16:35 |
| — | Pause / Play | PAUSED_PLAYBACK, then PLAYING from the same point | 17:07 → 17:08 |
| 2 | Stop → Info → Resume → Cast → LG | PLAYING after ~4 s | 17:16 |
| 3 | Stop → Resume (phone played locally ~3 min) → Cast → LG | PLAYING after 8 s | 19:52 |

No 701, 601, SOAP timeout or false "Play failed" occurred. The LG answers `GetVolume` with 606 (not authorized); playback is unaffected.

Not verified in this round: the Haier Chromecast (left untouched at the owner's request), the 4K HDR MKV remux path on LG with the full APK (verified on fixes.3 before the later fixes), and the 2.74 GB release, which Torrentio no longer lists for The Whale.

Network notes from the same session: without a VPN the provider throttles Cloudflare, so the Torrentio list can take tens of seconds or time out. The tested VPN server dropped BitTorrent peer connections. The Torrentio provider module (`Zenda-Cross/vega-providers`) builds bare `magnet:?xt=urn:btih:` links and discards the `sources` trackers Torrentio returns, including Rutracker's `bt*.t-ru.org` trackers; that module is outside this repository.

Checks: `npx tsc --noEmit` passes. The full Jest suite runs 153 suites: 144 pass and the same nine upstream suites listed above fail (1,060 tests pass, the same two fail). No new failures.
