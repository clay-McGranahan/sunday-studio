// Probes a TCP host:port using Apple's Network.framework (NWConnection).
// Plain BSD sockets from an app without Local Network consent fail silently
// with EHOSTUNREACH and never show the system prompt. Going through
// Network.framework makes macOS show the "access devices on your local
// network" prompt, which grants consent for the whole app (including the
// Node sockets the OpenAI SDK uses) once the user allows it.
// Usage: sunday-lanprobe <host> <port> [timeoutMs]
// Exit 0 = reachable, 1 = unreachable/denied, 2 = bad args, 3 = timed out.
import Foundation
import Network

let args = CommandLine.arguments
guard args.count >= 3, let portValue = UInt16(args[2]), portValue > 0 else {
  fputs("usage: sunday-lanprobe <host> <port> [timeoutMs]\n", stderr)
  exit(2)
}
let hostName = args[1]
let timeoutMs = args.count >= 4 ? Double(args[3]) ?? 4000 : 4000

let connection = NWConnection(
  host: NWEndpoint.Host(hostName),
  port: NWEndpoint.Port(rawValue: portValue)!,
  using: .tcp
)
let done = DispatchSemaphore(value: 0)
var reachable = false
connection.stateUpdateHandler = { state in
  switch state {
  case .ready:
    reachable = true
    done.signal()
  case .failed, .cancelled:
    done.signal()
  default:
    break
  }
}
connection.start(queue: .global())
if done.wait(timeout: .now() + .milliseconds(Int(timeoutMs))) == .timedOut {
  connection.cancel()
  exit(3)
}
connection.cancel()
exit(reachable ? 0 : 1)
