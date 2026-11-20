import CoreImage
import CoreML
import ExpoModulesCore
import ImageIO
import UIKit
import UniformTypeIdentifiers
import Vision
import VisionKit

// card-kit (SPEC §6.1, D11): a COPY of Offscan's scan-kit (~/Developer/pdf-scanner/modules/scan-kit at commit 79218b7,
// the state verified on the iOS 26.5 simulator and the Android emulator in Offscan's P6–P8), trimmed for cards (no PDF
// functions, no 1-bit packing) and extended with detectBarcodes (Vision). No runtime sharing with Offscan.
// AsyncFunctions run on the module's background queue unless they present UI (.runOnQueue(.main)).

struct RenderOptions: Record {
  @Field var src: String = ""
  @Field var out: String = ""
  @Field var quad: [[String: Double]]? = nil
  @Field var width: Int? = nil
  @Field var height: Int? = nil
  @Field var maxSide: Int? = nil
  @Field var filter: String = "original"
  @Field var brightness: Int = 0
  @Field var contrast: Int = 0
  @Field var threshold: Int = 0
  @Field var quality: Double = 0.9
}

struct RecognizeOptions: Record {
  @Field var langs: [String] = []
  @Field var rotation: Int = 0
}

struct ScanOptions: Record {
  @Field var pageLimit: Int? = nil
}

public class CardKitModule: Module {
  private var scanSession: ScanSession?
  private var sharing = false
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  public func definition() -> ModuleDefinition {
    Name("CardKit")

    AsyncFunction("scannerStatus") { () -> String in
      VNDocumentCameraViewController.isSupported ? "ready" : "unavailable"
    }

    // VisionKit document camera. Pages are written as JPEG q 0.92 into the caches folder; the caller moves them.
    AsyncFunction("scanDocument") { (options: ScanOptions, promise: Promise) in
      guard VNDocumentCameraViewController.isSupported else {
        promise.reject("E_SCANNER_UNAVAILABLE", "The document scanner is not available on this device")
        return
      }
      guard self.scanSession == nil else {
        promise.reject("E_BUSY", "The scanner is already open")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW", "No view controller to present the scanner from")
        return
      }
      let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("scans", isDirectory: true)
      let session = ScanSession(dir: dir, limit: options.pageLimit) { [weak self] result in
        self?.scanSession = nil
        switch result {
        case .success(let value): promise.resolve(value)
        case .failure(let error): promise.reject("E_SCAN_FAILED", error.localizedDescription)
        }
      }
      self.scanSession = session
      let vc = VNDocumentCameraViewController()
      vc.delegate = session
      presenter.present(vc, animated: true)
    }.runOnQueue(.main)

    // Apple's document segmentation (iOS 15+): normalised corners [TL, TR, BR, BL], top-left origin, or nil.
    AsyncFunction("detectDocument") { (uri: String) -> [[String: Double]]? in
      let image = try Self.loadUpright(uri)
      let request = VNDetectDocumentSegmentationRequest()
      try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
      guard let o = request.results?.first, o.confidence >= 0.5 else { return nil }
      let flip = { (p: CGPoint) -> [String: Double] in ["x": Double(p.x), "y": Double(1 - p.y)] }
      return [flip(o.topLeft), flip(o.topRight), flip(o.bottomRight), flip(o.bottomLeft)]
    }

    // Upright gray thumbnail by CoreGraphics area averaging (as the detector's fixture generator does).
    AsyncFunction("grayThumbnail") { (uri: String, maxSide: Int) -> [String: Any] in
      let image = try Self.loadUpright(uri)
      let (w, h) = Self.fit(image.width, image.height, maxSide)
      var gray = [UInt8](repeating: 0, count: w * h)
      let ok = gray.withUnsafeMutableBytes { buf -> Bool in
        guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return true
      }
      guard ok else { throw ImageException("Could not draw the thumbnail") }
      return ["w": w, "h": h, "base64": Data(gray).base64EncodedString()]
    }

    // Upright JPEG without metadata (GPS/EXIF never leave the import, A9).
    AsyncFunction("normalizeImport") { (uri: String, out: String, maxSide: Int) -> [String: Int] in
      let image = try Self.loadUpright(uri)
      let scaled = try Self.scale(image, maxSide)
      try Self.writeJpeg(scaled, to: out, quality: 0.92)
      return ["w": scaled.width, "h": scaled.height]
    }

    // source → (warp by quad) → filter → sliders → JPEG (SPEC §5.3 pipeline; rotation is never baked).
    AsyncFunction("render") { (o: RenderOptions) -> [String: Int] in
      var image = try Self.loadUpright(o.src)
      if let quad = o.quad, quad.count == 4 {
        image = try self.warp(image, quad: quad, width: o.width, height: o.height)
      } else if let w = o.width, let h = o.height, w > 0, h > 0, (w != image.width || h != image.height) {
        image = try Self.resize(image, w, h)
      }
      if let maxSide = o.maxSide, maxSide > 0 { image = try Self.scale(image, maxSide) }
      let isIdentity = o.filter == "original" && o.brightness == 0 && o.contrast == 0
      if !isIdentity {
        var (px, w, h) = try Self.rgba(image)
        px = Filters.apply(px, w, h, filter: o.filter, brightness: o.brightness, contrast: o.contrast, threshold: o.threshold)
        image = try Self.cgImage(px, w, h)
      }
      try Self.writeJpeg(image, to: o.out, quality: o.quality)
      return ["w": image.width, "h": image.height]
    }

    AsyncFunction("exportJpeg") { (src: String, out: String, maxSide: Int, quality: Double) -> [String: Int] in
      let image = try Self.scale(try Self.loadUpright(src), maxSide)
      try Self.writeJpeg(image, to: out, quality: quality)
      return ["w": image.width, "h": image.height]
    }

    // Vision .accurate (SPEC §5.7 RawVision): line corners and per-word boxes, normalised, BOTTOM-left origin, in the
    // frame of the image as displayed (rotated by `rotation`; the caller unrotates).
    AsyncFunction("recognize") { (uri: String, options: RecognizeOptions) -> [String: Any] in
      let image = try Self.loadUpright(uri)
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      let supported = Set((try? request.supportedRecognitionLanguages()) ?? [])
      let langs = options.langs.filter { supported.contains($0) }
      if !langs.isEmpty { request.recognitionLanguages = langs }
      if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = langs.isEmpty }
      Self.cpuOnSimulator(request)
      let handler = VNImageRequestHandler(cgImage: image, orientation: Self.orientation(options.rotation), options: [:])
      try handler.perform([request])
      var lines: [[String: Any]] = []
      for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string
        var words: [[String: Any]] = []
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: .byWords) { word, range, _, _ in
          guard let word = word, let box = try? candidate.boundingBox(for: range) else { return }
          words.append(["text": word, "quad": Self.corners(box.topLeft, box.topRight, box.bottomRight, box.bottomLeft)])
        }
        // .byWords drops punctuation ("Nr." → "Nr"); keep the line text's own tokens when the counts agree.
        let tokens = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if tokens.count == words.count {
          for k in 0..<words.count { words[k]["text"] = tokens[k] }
        } else {
          words = []
        }
        lines.append([
          "text": text,
          "confidence": Double(candidate.confidence),
          "quad": Self.corners(observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft),
          "words": words,
        ])
      }
      return ["engine": "vision", "langs": langs, "lines": lines]
    }

    AsyncFunction("ocrLanguages") { () -> [String] in
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      return (try? request.supportedRecognitionLanguages()) ?? []
    }

    // Printed codes (SPEC §6.1): QR, Aztec, Data Matrix, PDF417. Raw payload text (and bytes when Vision has them),
    // box normalised with a TOP-left origin in the upright image.
    AsyncFunction("detectBarcodes") { (uri: String) -> [[String: Any]] in
      let image = try Self.loadUpright(uri)
      var request = VNDetectBarcodesRequest()
      request.symbologies = [.qr, .aztec, .dataMatrix, .pdf417]
      do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
      } catch {
        // simulator: no inference context on the default device → CPU (see cpuOnSimulator)
        request = VNDetectBarcodesRequest()
        request.symbologies = [.qr, .aztec, .dataMatrix, .pdf417]
        Self.cpuOnSimulator(request)
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
      }
      #if targetEnvironment(simulator)
      // simulator: try the other model revisions on the CPU when the current one finds nothing (P6 self-test)
      if (request.results ?? []).isEmpty {
        for rev in VNDetectBarcodesRequest.supportedRevisions.sorted(by: >) {
          let r = VNDetectBarcodesRequest()
          r.revision = rev
          Self.cpuOnSimulator(r)
          if (try? VNImageRequestHandler(cgImage: image, options: [:]).perform([r])) != nil, !(r.results ?? []).isEmpty {
            request = r
            break
          }
        }
      }
      #endif
      return (request.results ?? []).compactMap { o in
        let format: String
        switch o.symbology {
        case .qr: format = "qr"
        case .aztec: format = "aztec"
        case .dataMatrix: format = "datamatrix"
        case .pdf417: format = "pdf417"
        default: format = "other"
        }
        var item: [String: Any] = [
          "format": format,
          "text": o.payloadStringValue ?? "",
          "box": ["x": Double(o.boundingBox.minX), "y": Double(1 - o.boundingBox.maxY), "w": Double(o.boundingBox.width), "h": Double(o.boundingBox.height)],
        ]
        if #available(iOS 17.0, *), let data = o.payloadData { item["bytesBase64"] = data.base64EncodedString() }
        return item
      }
    }

    // safe-share's share sheet: resolves true when the user completed an action, false when cancelled.
    AsyncFunction("shareFiles") { (uris: [String], _: [String], _: String, promise: Promise) in
      guard !self.sharing else {
        promise.reject("E_BUSY", "The share sheet is already open")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW", "No view controller to present the share sheet from")
        return
      }
      let vc = UIActivityViewController(activityItems: uris.map { Self.fileUrl($0) }, applicationActivities: nil)
      var resolved = false
      vc.completionWithItemsHandler = { [weak self] _, completed, _, _ in
        guard !resolved else { return }
        resolved = true
        self?.sharing = false
        promise.resolve(completed)
      }
      if let pop = vc.popoverPresentationController {
        pop.sourceView = presenter.view
        pop.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 80, width: 1, height: 1)
      }
      self.sharing = true
      presenter.present(vc, animated: true)
    }.runOnQueue(.main)

    // Self-test (dev route): the filter port on raw RGBA, compared with the TS reference in JS.
    AsyncFunction("filterRgba") { (base64: String, width: Int, height: Int, filter: String, brightness: Int, contrast: Int, threshold: Int) -> String in
      guard let data = Data(base64Encoded: base64), data.count == width * height * 4 else { throw ImageException("Bad RGBA input") }
      let out = Filters.apply([UInt8](data), width, height, filter: filter, brightness: brightness, contrast: contrast, threshold: threshold)
      return Data(out).base64EncodedString()
    }
  }

  // MARK: - Warp

  /// CIPerspectiveCorrection of the normalised quad (top-left origin), then scaled to width × height.
  private func warp(_ image: CGImage, quad: [[String: Double]], width: Int?, height: Int?) throws -> CGImage {
    let W = Double(image.width), H = Double(image.height)
    // Core Image has a bottom-left origin.
    let pt = { (i: Int) -> CIVector in CIVector(x: CGFloat((quad[i]["x"] ?? 0) * W), y: CGFloat(H - (quad[i]["y"] ?? 0) * H)) }
    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { throw ImageException("No perspective filter") }
    filter.setValue(CIImage(cgImage: image), forKey: kCIInputImageKey)
    filter.setValue(pt(0), forKey: "inputTopLeft")
    filter.setValue(pt(1), forKey: "inputTopRight")
    filter.setValue(pt(2), forKey: "inputBottomRight")
    filter.setValue(pt(3), forKey: "inputBottomLeft")
    guard var out = filter.outputImage else { throw ImageException("Warp failed") }
    out = out.transformed(by: CGAffineTransform(translationX: -out.extent.origin.x, y: -out.extent.origin.y))
    if let w = width, let h = height, w > 0, h > 0 {
      out = out.transformed(by: CGAffineTransform(scaleX: CGFloat(w) / out.extent.width, y: CGFloat(h) / out.extent.height))
    }
    let rect = CGRect(x: 0, y: 0, width: (out.extent.width).rounded(), height: (out.extent.height).rounded())
    guard let cg = ciContext.createCGImage(out, from: rect, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else {
      throw ImageException("Warp render failed")
    }
    return cg
  }

  // MARK: - Image helpers

  static func fileUrl(_ uri: String) -> URL {
    if let url = URL(string: uri), url.scheme != nil { return url }
    return URL(fileURLWithPath: uri)
  }

  static func fit(_ w: Int, _ h: Int, _ maxSide: Int) -> (Int, Int) {
    let long = max(w, h)
    guard maxSide > 0, long > maxSide else { return (w, h) }
    let s = Double(maxSide) / Double(long)
    return (max(1, Int((Double(w) * s).rounded())), max(1, Int((Double(h) * s).rounded())))
  }

  /// Decodes with the EXIF orientation applied (pixels upright).
  static func loadUpright(_ uri: String) throws -> CGImage {
    let url = fileUrl(uri)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else {
      throw ImageException("Could not open the image at \(uri)")
    }
    let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    guard raw != 1, let o = CGImagePropertyOrientation(rawValue: raw) else { return image }
    let ci = CIImage(cgImage: image).oriented(o)
    guard let cg = CIContext().createCGImage(ci, from: ci.extent) else { throw ImageException("Could not orient the image") }
    return cg
  }

  static func scale(_ image: CGImage, _ maxSide: Int) throws -> CGImage {
    let (w, h) = fit(image.width, image.height, maxSide)
    return (w == image.width && h == image.height) ? image : try resize(image, w, h)
  }

  static func resize(_ image: CGImage, _ w: Int, _ h: Int) throws -> CGImage {
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
      throw ImageException("Could not resize")
    }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    guard let out = ctx.makeImage() else { throw ImageException("Could not resize") }
    return out
  }

  static func rotate(_ image: CGImage, _ degrees: Int) throws -> CGImage {
    let o: CGImagePropertyOrientation = degrees == 90 ? .right : degrees == 180 ? .down : .left
    let ci = CIImage(cgImage: image).oriented(o)
    guard let cg = CIContext().createCGImage(ci, from: ci.extent) else { throw ImageException("Could not rotate") }
    return cg
  }

  /// RGBA bytes (alpha 255) in sRGB.
  static func rgba(_ image: CGImage) throws -> ([UInt8], Int, Int) {
    let w = image.width, h = image.height
    var px = [UInt8](repeating: 255, count: w * h * 4)
    let ok = px.withUnsafeMutableBytes { buf -> Bool in
      guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard ok else { throw ImageException("Could not read pixels") }
    for i in 0..<(w * h) { px[4 * i + 3] = 255 }
    return (px, w, h)
  }

  static func cgImage(_ px: [UInt8], _ w: Int, _ h: Int) throws -> CGImage {
    guard let provider = CGDataProvider(data: Data(px) as CFData),
          let image = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else {
      throw ImageException("Could not build the image")
    }
    return image
  }

  /// JPEG without any metadata.
  static func writeJpeg(_ image: CGImage, to out: String, quality: Double) throws {
    let url = fileUrl(out)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
      throw ImageException("Could not write \(out)")
    }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw ImageException("Could not write \(out)") }
  }

  static func orientation(_ rotation: Int) -> CGImagePropertyOrientation {
    switch ((rotation % 360) + 360) % 360 {
    case 90: return .right
    case 180: return .down
    case 270: return .left
    default: return .up
    }
  }

  /// The iOS simulator has no Neural Engine/GPU inference context for some Vision models ("Could not create inference
  /// context", P6 self-test): run them on the CPU there. Phones keep Vision's default devices.
  static func cpuOnSimulator(_ request: VNRequest) {
    #if targetEnvironment(simulator)
    if #available(iOS 17.0, *) {
      if let devices = try? request.supportedComputeStageDevices {
        for (stage, list) in devices {
          if let cpu = list.first(where: { if case .cpu = $0 { return true } else { return false } }) { request.setComputeDevice(cpu, for: stage) }
        }
      }
    } else {
      request.usesCPUOnly = true
    }
    #endif
  }

  static func corners(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint, _ d: CGPoint) -> [[String: Double]] {
    [a, b, c, d].map { ["x": Double($0.x), "y": Double($0.y)] }
  }

}

/// One VisionKit scanner run.
final class ScanSession: NSObject, VNDocumentCameraViewControllerDelegate {
  private let dir: URL
  private let limit: Int?
  private let done: (Result<[String: Any], Error>) -> Void

  init(dir: URL, limit: Int?, done: @escaping (Result<[String: Any], Error>) -> Void) {
    self.dir = dir
    self.limit = limit
    self.done = done
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    let count = min(scan.pageCount, limit ?? Int.max)
    let images = (0..<count).map { scan.imageOfPage(at: $0) }
    controller.dismiss(animated: true)
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try FileManager.default.createDirectory(at: self.dir, withIntermediateDirectories: true)
        let stamp = UUID().uuidString
        var pages: [[String: Any]] = []
        for (i, image) in images.enumerated() {
          guard let data = image.jpegData(compressionQuality: 0.92) else { throw ImageException("Could not encode page \(i + 1)") }
          let url = self.dir.appendingPathComponent("scan-\(stamp)-\(i).jpg")
          try data.write(to: url, options: .atomic)
          let px = image.cgImage.map { ($0.width, $0.height) } ?? (Int(image.size.width * image.scale), Int(image.size.height * image.scale))
          pages.append(["uri": url.absoluteString, "w": px.0, "h": px.1])
        }
        self.done(.success(["status": "ok", "pages": pages]))
      } catch {
        self.done(.failure(error))
      }
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    done(.success(["status": "cancel", "pages": [] as [Any]]))
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true)
    done(.failure(error))
  }
}

final class ImageException: GenericException<String> {
  override var reason: String { param }
}

