import Foundation

// Port of src/engine/filters.ts (SPEC §5.3) — the TS file is the reference; integer arithmetic only, so the port must
// match it exactly (self-test route compares, O4b). Int is 64-bit: box sums of 12 MP images exceed Int32 (review N7).
enum Filters {
  static func floorDiv(_ a: Int, _ b: Int) -> Int { a >= 0 ? a / b : -((-a + b - 1) / b) }
  /** round(n / d), d > 0: floor((2n + d) / (2d)). */
  static func divRound(_ n: Int, _ d: Int) -> Int { floorDiv(2 * n + d, 2 * d) }
  /** sign(x)·floor(|x| + 0.5). */
  static func divRoundSigned(_ n: Int, _ d: Int) -> Int {
    let a = (2 * abs(n) + d) / (2 * d)
    return n < 0 ? -a : a
  }
  @inline(__always) static func clamp(_ v: Int) -> Int { v < 0 ? 0 : (v > 255 ? 255 : v) }
  @inline(__always) static func luma(_ r: Int, _ g: Int, _ b: Int) -> Int { (77 * r + 150 * g + 29 * b + 128) >> 8 }

  static func percentiles(_ hist: [Int], _ n: Int) -> (lo: Int, hi: Int) {
    let needLo = (5 * n + 999) / 1000
    let needHi = (995 * n + 999) / 1000
    var cum = 0
    var lo = -1
    var hi = 255
    for v in 0..<256 {
      cum += hist[v]
      if lo < 0 && cum >= needLo { lo = v }
      if cum >= needHi { hi = v; break }
    }
    return (lo < 0 ? 0 : lo, hi)
  }

  @inline(__always) static func levels(_ v: Int, _ lo: Int, _ hi: Int) -> Int {
    hi - lo < 32 ? v : clamp(divRound((v - lo) * 255, hi - lo))
  }

  static func adjust(_ v: Int, _ brightness: Int, _ contrast: Int) -> Int {
    let shift = divRoundSigned(brightness * 128, 100)
    return clamp(divRoundSigned((v - 128) * (100 + contrast) + 100 * (128 + shift), 100))
  }

  static func bwK(_ threshold: Int) -> Int { min(40, max(0, 15 + divRoundSigned(threshold, 10))) }

  /** Summed-area table (w+1)×(h+1). */
  static func integral(_ values: [UInt8], _ w: Int, _ h: Int) -> [Int] {
    var s = [Int](repeating: 0, count: (w + 1) * (h + 1))
    for y in 0..<h {
      var row = 0
      for x in 0..<w {
        row += Int(values[y * w + x])
        s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row
      }
    }
    return s
  }

  static func forEachBox(_ s: [Int], _ w: Int, _ h: Int, _ r: Int, _ fn: (Int, Int, Int) -> Void) {
    let W = w + 1
    for y in 0..<h {
      let y0 = max(0, y - r), y1 = min(h, y + r + 1)
      let rowA = y0 * W, rowB = y1 * W, hh = y1 - y0
      for x in 0..<w {
        let x0 = max(0, x - r), x1 = min(w, x + r + 1)
        fn(y * w + x, s[rowB + x1] - s[rowA + x1] - s[rowB + x0] + s[rowA + x0], (x1 - x0) * hh)
      }
    }
  }

  static func lumaPlane(_ rgba: [UInt8], _ n: Int) -> [UInt8] {
    var y = [UInt8](repeating: 0, count: n)
    for i in 0..<n { y[i] = UInt8(luma(Int(rgba[4 * i]), Int(rgba[4 * i + 1]), Int(rgba[4 * i + 2]))) }
    return y
  }

  static func histogram(_ v: [UInt8]) -> [Int] {
    var h = [Int](repeating: 0, count: 256)
    for x in v { h[Int(x)] += 1 }
    return h
  }

  /** B&W plane (0/255): black iff Y·A·100 < S·(100 − K). */
  static func bwPlane(_ rgba: [UInt8], _ w: Int, _ h: Int, _ threshold: Int) -> [UInt8] {
    let n = w * h
    let y = lumaPlane(rgba, n)
    let s = integral(y, w, h)
    let r = max(4, min(w, h) / 40)
    let keep = 100 - bwK(threshold)
    var out = [UInt8](repeating: 0, count: n)
    forEachBox(s, w, h, r) { i, sum, area in out[i] = Int(y[i]) * area * 100 < sum * keep ? 0 : 255 }
    return out
  }

  /** The filter + sliders on RGBA (alpha ignored, set to 255), exactly as applyFilter in filters.ts. */
  static func apply(_ rgba: [UInt8], _ w: Int, _ h: Int, filter: String, brightness: Int, contrast: Int, threshold: Int) -> [UInt8] {
    let n = w * h
    var out = [UInt8](repeating: 255, count: n * 4)
    let sliders = brightness != 0 || contrast != 0
    @inline(__always) func fin(_ v: Int) -> UInt8 { UInt8(sliders ? adjust(v, brightness, contrast) : v) }
    switch filter {
    case "bw":
      let bw = bwPlane(rgba, w, h, threshold)
      for i in 0..<n { out[4 * i] = bw[i]; out[4 * i + 1] = bw[i]; out[4 * i + 2] = bw[i] }
    case "gray":
      let y = lumaPlane(rgba, n)
      let p = percentiles(histogram(y), n)
      for i in 0..<n {
        let v = fin(levels(Int(y[i]), p.lo, p.hi))
        out[4 * i] = v; out[4 * i + 1] = v; out[4 * i + 2] = v
      }
    case "auto":
      let r = max(8, min(w, h) / 16)
      var v = [UInt8](repeating: 0, count: n * 3)
      var plane = [UInt8](repeating: 0, count: n)
      for c in 0..<3 {
        for i in 0..<n { plane[i] = rgba[4 * i + c] }
        let s = integral(plane, w, h)
        forEachBox(s, w, h, r) { i, sum, area in
          let m = max(divRound(sum, area), 1)
          v[3 * i + c] = UInt8(clamp(divRound(255 * Int(plane[i]), m)))
        }
      }
      var yv = [UInt8](repeating: 0, count: n)
      for i in 0..<n { yv[i] = UInt8(luma(Int(v[3 * i]), Int(v[3 * i + 1]), Int(v[3 * i + 2]))) }
      let p = percentiles(histogram(yv), n)
      for i in 0..<n {
        out[4 * i] = fin(levels(Int(v[3 * i]), p.lo, p.hi))
        out[4 * i + 1] = fin(levels(Int(v[3 * i + 1]), p.lo, p.hi))
        out[4 * i + 2] = fin(levels(Int(v[3 * i + 2]), p.lo, p.hi))
      }
    default:
      for i in 0..<n {
        out[4 * i] = fin(Int(rgba[4 * i])); out[4 * i + 1] = fin(Int(rgba[4 * i + 1])); out[4 * i + 2] = fin(Int(rgba[4 * i + 2]))
      }
    }
    return out
  }
}
