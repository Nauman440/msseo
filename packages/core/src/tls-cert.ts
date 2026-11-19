import { connect } from 'node:tls';

/** Module 13 / Module 1 "Automate": when the site's TLS certificate expires (ISO date), or null. */
export function certificateExpiry(host: string, timeoutMs = 15_000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      const t = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      resolve(Number.isFinite(t) ? new Date(t).toISOString() : null);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', () => resolve(null));
  });
}
