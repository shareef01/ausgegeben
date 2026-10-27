package com.aus.ausgegeben.data

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.Collections

/**
 * A TCP relay to the Firestore emulator that a test can cut and restore.
 *
 * `FirebaseFirestore.disableNetwork()` is not a stand-in for losing connectivity: it is a
 * client-side flag that transactions do not honour, so a test that "goes offline" with it
 * can commit straight to the server and never reach the offline code path it claims to
 * cover. Cutting this relay closes its listening socket and every open connection, so the
 * SDK sees what it sees with no network — refused connections — until [restore] listens
 * again on the same port.
 */
class CuttableProxy(private val targetHost: String, private val targetPort: Int) : AutoCloseable {
    private val sockets: MutableSet<Socket> = Collections.synchronizedSet(mutableSetOf())

    @Volatile
    private var server: ServerSocket? = null

    val port: Int

    init {
        port = listen(0)
    }

    private fun listen(onPort: Int): Int {
        val socket = ServerSocket().apply {
            reuseAddress = true
            bind(InetSocketAddress(InetAddress.getLoopbackAddress(), onPort))
        }
        server = socket
        Thread({ acceptLoop(socket) }, "cuttable-proxy-accept").apply { isDaemon = true }.start()
        return socket.localPort
    }

    private fun acceptLoop(listening: ServerSocket) {
        while (!listening.isClosed) {
            val client = try { listening.accept() } catch (_: IOException) { return }
            val upstream = try {
                Socket(targetHost, targetPort)
            } catch (_: IOException) {
                client.close()
                continue
            }
            sockets.add(client)
            sockets.add(upstream)
            pump(client.getInputStream(), upstream.getOutputStream(), client, upstream)
            pump(upstream.getInputStream(), client.getOutputStream(), client, upstream)
        }
    }

    private fun pump(from: InputStream, to: OutputStream, a: Socket, b: Socket) {
        Thread({
            try {
                from.copyTo(to)
            } catch (_: IOException) {
                // Either side closing (including a cut) ends the relay.
            } finally {
                closeQuietly(a)
                closeQuietly(b)
            }
        }, "cuttable-proxy-pump").apply { isDaemon = true }.start()
    }

    private fun closeQuietly(socket: Socket) {
        try { socket.close() } catch (_: IOException) {}
        sockets.remove(socket)
    }

    /** Refuse new connections and drop every open one. */
    @Synchronized
    fun cut() {
        server?.close()
        server = null
        synchronized(sockets) { sockets.toList() }.forEach(::closeQuietly)
    }

    /** Accept connections again on the same port. */
    @Synchronized
    fun restore() {
        if (server == null) listen(port)
    }

    override fun close() = cut()
}
