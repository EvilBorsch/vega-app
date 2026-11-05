# Reliable casting and remembered movie servers

The reported failures occur on repeated Chromecast/DLNA playback in Vega 5.2.2. Work is isolated from tenet-launcher in this fork.

Play opens a server chooser before any remote source starts. Resume selects the last chosen server for that provider and episode and uses the existing saved position. Fresh provider URLs must be resolved again; do not persist headers or expiring links. If the remembered server is absent, ask the user instead of choosing the first/highest-quality entry. Explicit local files and unfinished downloads retain their existing startup behavior.

DLNA loads must stop the renderer before changing its URI, tolerate an already-stopped renderer, recover once from UPnP transition error 701, and never send Play after cancellation. Preserve existing polling generation checks.

FFmpeg lifecycle investigation: openStream registers a session only after a potentially blocking FIFO open. close/retire therefore cannot cancel a startup in progress. Canceling a session also does not unblock native FIFO open/write calls. Register ownership before startup waits, unblock both sides during teardown, close late resources, and retain meaningful FFmpeg failures instead of a null timeout message.

Implementation uses an anonymous Android pipe opened before FFmpeg is scheduled. Its numeric writer descriptor remains owned until the completion callback; closing the reader makes writes fail promptly. A shared cancellation scheduler handles sessions that are still queued, because the SDK ignores cancel while a session is CREATED. Warm the registered stream on the phone before issuing the receiver load, wait for actual media rather than only MP4 headers, allow a cold loopback torrent up to two minutes, and cancel that wait immediately when superseded. A two-minute readiness deadline also covers header-only output. Delayed Cast delivery errors are fenced by playback generation.

Approach: repair the existing services and stream hook rather than replace the casting stack. Replacing the stack or transcoding all video would add unnecessary compatibility and performance risks. Device logs and regression tests will determine the final scope. Runtime verification must distinguish automated checks from physical receiver results.
