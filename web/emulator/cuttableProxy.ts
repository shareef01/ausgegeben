import net from 'node:net';

/**
 * A TCP relay to the Firestore emulator that a test can cut and restore.
 *
 * `disableNetwork()` is not a stand-in for losing connectivity: it is a client-side flag
 * that transactions ignore, so a test that "goes offline" with it can commit straight to
 * the server and never reach the offline code path it claims to cover. Cutting this relay
 * closes its listening socket and every open connection, so the SDK sees exactly what it
 * sees with no network — refused connections — until `restore()` listens again on the
 * same port.
 */
export interface CuttableProxy {
  readonly port: number;
  cut(): Promise<void>;
  restore(): Promise<void>;
  close(): Promise<void>;
}

export async function startCuttableProxy(targetHost: string, targetPort: number): Promise<CuttableProxy> {
  const sockets = new Set<net.Socket>();

  const createServer = () => net.createServer((client) => {
    const upstream = net.connect(targetPort, targetHost);
    sockets.add(client);
    sockets.add(upstream);
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on('error', closeBoth);
    upstream.on('error', closeBoth);
    client.on('close', closeBoth);
    upstream.on('close', closeBoth);
    client.pipe(upstream);
    upstream.pipe(client);
  });

  const listen = (server: net.Server, port: number) => new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });

  let server: net.Server | null = createServer();
  const port = await listen(server, 0);

  const stop = async () => {
    const closing = server;
    server = null;
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (closing) await new Promise<void>((resolve) => closing.close(() => resolve()));
  };

  return {
    port,
    cut: stop,
    async restore() {
      if (server) return;
      server = createServer();
      await listen(server, port);
    },
    close: stop,
  };
}
