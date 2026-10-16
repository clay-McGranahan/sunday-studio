// Draws build/icon-1024.png for the app icon. Regenerate build/icon.icns with:
//   swiftc scripts/make-icon.swift -o /tmp/make-icon && /tmp/make-icon /tmp/icon.png
//   then sips each size into an .iconset and run iconutil -c icns.
import AppKit
// macOS icon grid: 824pt tile inside a 1024 canvas. Graphite desk tile, paper page, one marked line.
let S: CGFloat = 1024
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
func c(_ h: UInt32, _ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: CGFloat((h>>16)&255)/255, green: CGFloat((h>>8)&255)/255, blue: CGFloat(h&255)/255, alpha: a) }
// flip to SVG-style coordinates
ctx.translateBy(x: 0, y: S); ctx.scaleBy(x: 1, y: -1)
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 12), blur: 28, color: c(0x000000, 0.3))
ctx.addPath(CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)); ctx.setFillColor(c(0x2A2E35)); ctx.fillPath()
ctx.restoreGState()
// glyph: 32-unit viewBox mapped into the tile
let k: CGFloat = 20, ox: CGFloat = 512 - 16*k, oy: CGFloat = 512 - 16*k
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x*k, y: oy + y*k) }
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: 10), blur: 24, color: c(0x000000, 0.35))
ctx.addPath(CGPath(roundedRect: CGRect(origin: p(4.5, 2.5), size: CGSize(width: 23*k, height: 27*k)), cornerWidth: 1.2*k, cornerHeight: 1.2*k, transform: nil))
ctx.setFillColor(c(0xF2F3EE)); ctx.fillPath()
ctx.restoreGState()
ctx.setLineCap(.round); ctx.setLineWidth(2*k)
ctx.setStrokeColor(c(0x8B9098))
for (a, b, y) in [(8.5, 23.5, 9.0), (8.5, 19.5, 23.0)] { ctx.move(to: p(a, y)); ctx.addLine(to: p(b, y)) }
ctx.strokePath()
ctx.move(to: p(7, 14.2)); ctx.addLine(to: p(25.5, 14.2)); ctx.addLine(to: p(24.7, 19)); ctx.addLine(to: p(6.2, 19)); ctx.closePath()
ctx.setFillColor(c(0xF4E04D)); ctx.fillPath()
ctx.setStrokeColor(c(0x1F2328)); ctx.move(to: p(8.5, 16.6)); ctx.addLine(to: p(22.5, 16.6)); ctx.strokePath()
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
