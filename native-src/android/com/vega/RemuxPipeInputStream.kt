package com.vega

import java.io.IOException
import java.io.InputStream

/** A nonblocking FIFO reader: no writer yet is not EOF, and close never waits on FFmpeg. */
class RemuxPipeInputStream(
    private val readAvailable: (ByteArray, Int, Int) -> Int,
    private val waitForData: () -> Unit,
    private val finished: () -> Boolean,
    private val failure: () -> String?,
    private val release: () -> Unit,
    private val clock: () -> Long = { System.nanoTime() / 1_000_000 },
    private val startupTimeoutMs: Long = 25_000,
) : InputStream() {
    private val lock = Any()
    private var closed = false
    private var receivedData = false
    private val startedAt = clock()

    override fun read(): Int {
        val one = ByteArray(1)
        return if (read(one, 0, 1) < 0) -1 else one[0].toInt() and 0xff
    }

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
        if (offset < 0 || length < 0 || length > bytes.size - offset) throw IndexOutOfBoundsException()
        if (length == 0) return 0
        while (true) {
            val count = synchronized(lock) {
                if (closed) throw IOException("Stream Closed")
                failure()?.let { throw IOException(it) }
                readAvailable(bytes, offset, length)
            }
            if (count > 0) { receivedData = true; return count }
            if (finished()) {
                // The producer may have completed between read and this check.
                val tail = synchronized(lock) {
                    if (closed) throw IOException("Stream Closed")
                    failure()?.let { throw IOException(it) }
                    readAvailable(bytes, offset, length)
                }
                return if (tail > 0) tail else -1
            }
            if (!receivedData && clock() - startedAt >= startupTimeoutMs) {
                throw IOException("FFmpeg produced no output within $startupTimeoutMs ms. The source may still be buffering.")
            }
            waitForData()
        }
    }

    override fun close() = synchronized(lock) {
        if (!closed) { closed = true; release() }
    }
}
