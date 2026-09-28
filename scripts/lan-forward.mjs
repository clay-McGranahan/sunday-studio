// Relays localhost:<local-port> to a server on your LAN, for testing a local AI server from an
// unsigned development build that macOS won't grant Local Network access.
// Usage: node scripts/lan-forward.mjs 192.168.1.129:8084 [local-port]
import net from 'node:net'

const [target = '', localPort = '18084'] = process.argv.slice(2)
const [host, port] = target.split(':')
if (!host || !port) {
  console.error('usage: node scripts/lan-forward.mjs <host:port> [local-port]')
  process.exit(1)
}

net
  .createServer((client) => {
    const upstream = net.connect({ host, port: Number(port) })
    client.pipe(upstream).pipe(client)
    const close = () => {
      client.destroy()
      upstream.destroy()
    }
    client.on('error', close)
    upstream.on('error', (err) => {
      console.error(`upstream: ${err.message}`)
      close()
    })
  })
  .listen(Number(localPort), '127.0.0.1', () => {
    console.log(`Forwarding http://127.0.0.1:${localPort} → ${host}:${port}  (Ctrl+C to stop)`)
  })
