// O3 real-OCR set (SPEC §13 O3, A6): renders synthetic business-card images with CoreGraphics/CoreText from a job list
// and runs macOS Vision on them with the SAME request settings as the app's native module (card-kit `recognize`,
// copied from Offscan scan-kit: VNRecognizeTextRequest .accurate, language correction on, the job's languages), plus
// VNDetectBarcodesRequest for printed QR codes. Output: <out>/images/<name>.jpg and <out>/raw/<name>.json
// ({ vision: RawVision (bottom-left origin, as the module returns it), codes: [{format,text}] }).
// Usage: swift scripts/o3/render-ocr.swift <jobs.json> <outDir>      (scripts/o3/o3.mjs prepares the jobs)
import AppKit
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct JobLine: Decodable { let text: String; let x: Double; let y: Double; let w: Double; let h: Double; let bold: Bool; let rtl: Bool }
struct JobCode: Decodable { let text: String; let x: Double; let y: Double; let w: Double; let h: Double }
struct Job: Decodable {
  let name: String; let width: Int; let height: Int; let lines: [JobLine]; let codes: [JobCode]; let langs: [String]
  let font: String; let bg: [Double]; let fg: [Double]; let rotation: Double; let noise: Double; let blur: Double
  let sizeJitter: Double; let seed: UInt64
}

struct Rng { var s: UInt64; mutating func next() -> Double { s = s &* 6364136223846793005 &+ 1442695040888963407; return Double((s >> 11) & 0xFFFFFFFFFFFFF) / Double(1 << 52) } }

func color(_ c: [Double]) -> NSColor { NSColor(srgbRed: c[0], green: c[1], blue: c[2], alpha: 1) }

func font(_ name: String, _ size: Double, bold: Bool) -> NSFont {
  let base = NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size)
  return bold ? NSFontManager.shared.convert(base, toHaveTrait: .boldFontMask) : base
}

func renderCard(_ job: Job) -> CGImage {
  let W = job.width, H = job.height
  let cs = CGColorSpace(name: CGColorSpace.sRGB)!
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(color(job.bg).cgColor)
  ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
  var rng = Rng(s: job.seed)
  for l in job.lines {
    let boxH = l.h * Double(H)
    var size = boxH * (1 + (rng.next() - 0.5) * job.sizeJitter)
    var f = font(job.font, size, bold: l.bold)
    // Box height ≈ ascender − descender of the font at that size.
    size = size * size / max(1, Double(f.ascender - f.descender))
    f = font(job.font, size, bold: l.bold)
    var attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: color(job.fg)]
    var s = NSAttributedString(string: l.text, attributes: attrs)
    let x0 = l.x * Double(W)
    let maxW = max(l.w * Double(W) * 1.35, 10)
    let room = l.rtl ? (l.x + l.w) * Double(W) - Double(W) * 0.02 : Double(W) * 0.98 - x0
    let limit = min(maxW, room)
    if Double(s.size().width) > limit {
      size *= limit / Double(s.size().width)
      f = font(job.font, size, bold: l.bold)
      attrs[.font] = f
      s = NSAttributedString(string: l.text, attributes: attrs)
    }
    let width = Double(s.size().width)
    let x = l.rtl ? (l.x + l.w) * Double(W) - width : x0
    let baseline = Double(H) - (l.y + l.h) * Double(H) - Double(f.descender)
    s.draw(at: NSPoint(x: x, y: baseline))
  }
  for c in job.codes {
    guard let filter = CIFilter(name: "CIQRCodeGenerator") else { continue }
    filter.setValue(c.text.data(using: .utf8), forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let out = filter.outputImage else { continue }
    let side = min(c.w * Double(W), c.h * Double(H))
    let scaled = out.transformed(by: CGAffineTransform(scaleX: side / out.extent.width, y: side / out.extent.height))
    let ci = CIContext()
    guard let qr = ci.createCGImage(scaled, from: scaled.extent) else { continue }
    ctx.interpolationQuality = .none
    ctx.draw(qr, in: CGRect(x: c.x * Double(W), y: Double(H) - (c.y * Double(H)) - side, width: side, height: side))
  }
  NSGraphicsContext.restoreGraphicsState()
  var image = ctx.makeImage()!
  // Imperfect perspective correction: a slight rotation, corners filled with the card colour.
  if job.rotation != 0 {
    let r = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    r.setFillColor(color(job.bg).cgColor)
    r.fill(CGRect(x: 0, y: 0, width: W, height: H))
    r.translateBy(x: Double(W) / 2, y: Double(H) / 2)
    r.rotate(by: job.rotation * .pi / 180)
    r.interpolationQuality = .high
    r.draw(image, in: CGRect(x: -Double(W) / 2, y: -Double(H) / 2, width: Double(W), height: Double(H)))
    image = r.makeImage()!
  }
  if job.blur > 0 {
    let ci = CIImage(cgImage: image).clampedToExtent().applyingGaussianBlur(sigma: job.blur).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
    image = CIContext().createCGImage(ci, from: CGRect(x: 0, y: 0, width: W, height: H))!
  }
  if job.noise > 0 {
    let n = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    n.draw(image, in: CGRect(x: 0, y: 0, width: W, height: H))
    let p = n.data!.bindMemory(to: UInt8.self, capacity: W * H * 4)
    for i in 0..<(W * H) {
      let d = (rng.next() + rng.next() + rng.next() - 1.5) * job.noise
      for k in 0..<3 { p[i * 4 + k] = UInt8(max(0, min(255, Double(p[i * 4 + k]) + d))) }
    }
    image = n.makeImage()!
  }
  return image
}

func writeJpeg(_ image: CGImage, _ url: URL) {
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
  CGImageDestinationFinalize(dest)
}

func corners(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint, _ d: CGPoint) -> [[String: Double]] {
  [a, b, c, d].map { ["x": Double($0.x), "y": Double($0.y)] }
}

// Same as card-kit `recognize` (Offscan scan-kit ScanKitModule.swift), on the JPEG as written (the app OCRs its stored file).
func recognize(_ url: URL, _ wanted: [String]) throws -> [String: Any] {
  let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
  let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  let supported = Set((try? request.supportedRecognitionLanguages()) ?? [])
  let langs = wanted.filter { supported.contains($0) }
  if !langs.isEmpty { request.recognitionLanguages = langs }
  request.automaticallyDetectsLanguage = langs.isEmpty
  let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
  try handler.perform([request])
  var lines: [[String: Any]] = []
  for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let text = candidate.string
    var words: [[String: Any]] = []
    text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: .byWords) { word, range, _, _ in
      guard let word = word, let box = try? candidate.boundingBox(for: range) else { return }
      words.append(["text": word, "quad": corners(box.topLeft, box.topRight, box.bottomRight, box.bottomLeft)])
    }
    let tokens = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    if tokens.count == words.count { for k in 0..<words.count { words[k]["text"] = tokens[k] } } else { words = [] }
    lines.append([
      "text": text, "confidence": Double(candidate.confidence),
      "quad": corners(observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft),
      "words": words,
    ])
  }
  let codesReq = VNDetectBarcodesRequest()
  try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([codesReq])
  let codes: [[String: Any]] = (codesReq.results ?? []).compactMap { o in
    guard let t = o.payloadStringValue else { return nil }
    return ["format": o.symbology == .qr ? "qr" : o.symbology.rawValue, "text": t]
  }
  return ["vision": ["engine": "vision", "langs": langs, "lines": lines], "codes": codes, "dropped": wanted.filter { !supported.contains($0) }]
}

let args = CommandLine.arguments
let jobs = try JSONDecoder().decode([Job].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let out = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: out.appendingPathComponent("images"), withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: out.appendingPathComponent("raw"), withIntermediateDirectories: true)
let t0 = Date()
for job in jobs {
  let url = out.appendingPathComponent("images/\(job.name).jpg")
  writeJpeg(renderCard(job), url)
  do {
    let t = Date()
    var result = try recognize(url, job.langs)
    result["ms"] = Int(Date().timeIntervalSince(t) * 1000)
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    try data.write(to: out.appendingPathComponent("raw/\(job.name).json"))
  } catch {
    FileHandle.standardError.write("\(job.name): \(error)\n".data(using: .utf8)!)
  }
}
print("rendered + recognised \(jobs.count) images in \(Int(Date().timeIntervalSince(t0))) s")
