// Sunday Studio speaker tracker.
//
// Usage: sunday-tracker <video> <start-seconds> <end-seconds> [samples-per-second]
//
// Decodes the clip range with AVFoundation and runs Apple Vision's human (upper body)
// and face detectors on sampled frames, on-device. Writes JSON lines to stdout:
//   {"type":"progress","value":0.42}
//   {"type":"frame","t":12.3,"people":[{"x":..,"y":..,"w":..,"h":..,"confidence":..,"face":bool}]}
//   {"type":"done","frames":N}
// Coordinates are normalised to the displayed (orientation-corrected) frame, origin top-left.

import AVFoundation
import Foundation
import Vision

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
        FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
    }
}

func fail(_ message: String) -> Never {
    emit(["type": "error", "message": message])
    exit(1)
}

func orientation(for transform: CGAffineTransform) -> CGImagePropertyOrientation {
    switch (transform.a, transform.b, transform.c, transform.d) {
    case (0, 1, -1, 0): return .right
    case (0, -1, 1, 0): return .left
    case (-1, 0, 0, -1): return .down
    default: return .up
    }
}

let args = CommandLine.arguments
guard args.count >= 4, let start = Double(args[2]), let end = Double(args[3]), end > start else {
    fail("usage: sunday-tracker <video> <start> <end> [samples-per-second]")
}
let samplesPerSecond = args.count > 4 ? (Double(args[4]) ?? 5) : 5
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first else { fail("No video track found.") }
let imageOrientation = orientation(for: track.preferredTransform)

guard let reader = try? AVAssetReader(asset: asset) else { fail("The video could not be opened.") }
reader.timeRange = CMTimeRange(
    start: CMTime(seconds: start, preferredTimescale: 600),
    end: CMTime(seconds: end, preferredTimescale: 600)
)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
])
output.alwaysCopiesSampleData = false
reader.add(output)
guard reader.startReading() else { fail(reader.error?.localizedDescription ?? "The video could not be decoded.") }

let bodyRequest = VNDetectHumanRectanglesRequest()
bodyRequest.upperBodyOnly = true
let faceRequest = VNDetectFaceRectanglesRequest()

var nextSample = start
var frames = 0
let interval = 1.0 / samplesPerSecond

func box(_ rect: CGRect) -> [String: Double] {
    // Vision uses a bottom-left origin.
    ["x": Double(rect.minX), "y": Double(1 - rect.maxY), "w": Double(rect.width), "h": Double(rect.height)]
}

while let sample = output.copyNextSampleBuffer() {
    let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
    guard t >= nextSample, let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
    nextSample = t + interval
    frames += 1

    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: imageOrientation, options: [:])
    try? handler.perform([bodyRequest, faceRequest])

    var people: [[String: Any]] = []
    for body in bodyRequest.results ?? [] {
        var entry: [String: Any] = box(body.boundingBox)
        entry["confidence"] = Double(body.confidence)
        entry["face"] = false
        people.append(entry)
    }
    for face in faceRequest.results ?? [] {
        var entry: [String: Any] = box(face.boundingBox)
        entry["confidence"] = Double(face.confidence)
        entry["face"] = true
        people.append(entry)
    }
    emit(["type": "frame", "t": t, "people": people])
    emit(["type": "progress", "value": min(1, (t - start) / (end - start))])
}

if reader.status == .failed { fail(reader.error?.localizedDescription ?? "Decoding failed.") }
emit(["type": "done", "frames": frames])
