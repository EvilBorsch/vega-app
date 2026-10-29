"""Check an active phone torrent URL (use adb forward for its loopback port).

The renderer's preparation must not lose its MKV index when FFmpeg closes a
range request and then seeks back from the tail. Run against the installed APK.
"""
import http.client
import sys
from urllib.parse import urlsplit

url = urlsplit(sys.argv[1])
if url.scheme != "http":
    raise SystemExit("Pass the phone's HTTP torrent stream URL")
connection = http.client.HTTPConnection(url.hostname, url.port, timeout=35)
connection.request("GET", url.path + ("?" + url.query if url.query else ""),
                   headers={"Range": "bytes=0-31", "Connection": "close"})
response = connection.getresponse()
assert response.status == 206, f"Expected a torrent range response, got {response.status}"
assert response.getheader("Content-Range", "").startswith("bytes 0-31/")
assert len(response.read()) == 32, "Truncated range response"
assert response.will_close, (
    "Server advertises keep-alive despite Connection: close. FFmpeg can reuse "
    "the closed socket, lose the MKV index and scan the torrent from the start."
)
connection.close()
print("PASS: torrent range length and Connection: close agree")
