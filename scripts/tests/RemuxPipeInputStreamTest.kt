import com.vega.RemuxPipeInputStream
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

private fun expectFailure(text: String, read: () -> Unit) {
    try { read(); error("Expected $text") } catch (e: IOException) { check(e.message!!.contains(text)) { e.message!! } }
}
fun main() {
    var ticks = 0L
    var complete = false
    var released = 0
    val pipe = RemuxPipeInputStream(
        readAvailable = { bytes, off, _ -> if (ticks < 2) -1 else {bytes[off] = 42; 1} },
        waitForData = {ticks++}, finished = {complete}, failure = {null}, release = {released++},
        clock = {ticks}, startupTimeoutMs = 5,
    )
    check(pipe.read() == 42) // No writer yet is not EOF; the same run eventually produces data.
    pipe.close(); pipe.close(); check(released == 1)
    expectFailure("Closed") {pipe.read()}

    ticks = 0
    val timeout = RemuxPipeInputStream({_, _, _ -> 0}, {ticks++}, {false}, {null}, {}, {ticks}, 5)
    expectFailure("5 ms") {timeout.read()}

    val failed = RemuxPipeInputStream({_, _, _ -> -1}, {}, {true}, {"HTTP 403"}, {})
    expectFailure("HTTP 403") {failed.read()}
    val ended = RemuxPipeInputStream({_, _, _ -> -1}, {}, {true}, {null}, {})
    check(ended.read() == -1)
    check(ended.read(ByteArray(1), 0, 0) == 0)

    val waiting = CountDownLatch(1)
    val exited = CountDownLatch(1)
    val canceled = RemuxPipeInputStream({_, _, _ -> 0}, {waiting.countDown(); Thread.sleep(5)}, {false}, {null}, {})
    val reader = thread(isDaemon = true) {try {expectFailure("Closed") {canceled.read()}} finally {exited.countDown()}}
    check(waiting.await(1, TimeUnit.SECONDS))
    canceled.close()
    check(exited.await(1, TimeUnit.SECONDS)) // Stopping startup must not wait for FFmpeg's input.
    reader.join()
    println("Remux pipe startup, EOF, failure, timeout and cancellation checks passed")
}
