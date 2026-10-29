// Encode a home-hero clip without ffmpeg, using macOS's own AVFoundation.
// Does what BRAND-GUIDE.md §5's ffmpeg recipe does: cut `duration` seconds
// starting at `start` from the 4K master, scale to 1920 wide at 25 fps, drop
// audio, H.264 with fast start — then writes the first frame as the poster.
//
//   swift tools/encode-hero-clip.swift <master.mp4> site/videos/hero-<n>.mp4 site/images/hero/hero-<n>.jpg <start> [duration=2.8] [bitrate=1100000]
//
// ~1.1 Mb/s lands a 2.8s clip at roughly 400KB, in line with the others.
import AVFoundation

let a = CommandLine.arguments
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2]), posterURL = URL(fileURLWithPath: a[3])
let start = Double(a[4])!
let dur = a.count > 5 ? Double(a[5])! : 2.8
let bitrate = a.count > 6 ? Int(a[6])! : 1_100_000
try? FileManager.default.removeItem(at: dst)

let asset = AVURLAsset(url: src)
let track = asset.tracks(withMediaType: .video)[0]
let natural = track.naturalSize.applying(track.preferredTransform)
let w = 1920, h = Int((Double(w) * abs(natural.height) / abs(natural.width) / 2).rounded()) * 2
print("source", natural, "fps", track.nominalFrameRate, "->", w, "x", h)

let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600),
                        duration: CMTime(seconds: dur, preferredTimescale: 600))
let comp = AVMutableVideoComposition(propertiesOf: asset)
comp.renderSize = CGSize(width: w, height: h)
comp.frameDuration = CMTime(value: 1, timescale: 25)
let instr = AVMutableVideoCompositionInstruction()
instr.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
let s = CGFloat(w) / abs(natural.width)
layer.setTransform(track.preferredTransform.concatenating(CGAffineTransform(scaleX: s, y: s)), at: .zero)
instr.layerInstructions = [layer]
comp.instructions = [instr]

let reader = try AVAssetReader(asset: asset)
reader.timeRange = range
let out = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings:
  [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
out.videoComposition = comp
reader.add(out)

let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                              AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                              AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate,
                                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                                    AVVideoMaxKeyFrameIntervalKey: 25,
                                    AVVideoExpectedSourceFrameRateKey: 25]])
input.expectsMediaDataInRealTime = false
writer.add(input)
reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: range.start)
var frames = 0
let q = DispatchQueue(label: "enc"); let done = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: q) {
  while input.isReadyForMoreMediaData {
    if let sb = out.copyNextSampleBuffer() { input.append(sb); frames += 1 }
    else { input.markAsFinished(); writer.finishWriting { done.signal() }; return }
  }
}
done.wait()
print("status", writer.status.rawValue, writer.error as Any, "frames", frames)

// Poster: the clip's first frame, JPEG at 82%
import AppKit
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: dst))
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
let frame = try gen.copyCGImage(at: .zero, actualTime: nil)
try NSBitmapImageRep(cgImage: frame).representation(using: .jpeg, properties: [.compressionFactor: 0.82])!.write(to: posterURL)
print("poster", frame.width, "x", frame.height)
