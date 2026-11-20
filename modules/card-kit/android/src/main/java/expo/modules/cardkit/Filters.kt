package expo.modules.cardkit

// Port of src/engine/filters.ts (SPEC §5.3) — the TS file is the reference; integer arithmetic only, so the port must
// match it exactly (self-test route compares, O4b). Box sums are Long: 12 MP images exceed Int (review N7).
object Filters {
  private fun floorDiv(a: Long, b: Long): Long = Math.floorDiv(a, b)
  fun divRound(n: Long, d: Long): Long = floorDiv(2 * n + d, 2 * d)
  fun divRoundSigned(n: Long, d: Long): Long {
    val a = (2 * Math.abs(n) + d) / (2 * d)
    return if (n < 0) -a else a
  }
  fun clamp(v: Long): Int = if (v < 0) 0 else if (v > 255) 255 else v.toInt()
  fun luma(r: Int, g: Int, b: Int): Int = (77 * r + 150 * g + 29 * b + 128) shr 8

  fun percentiles(hist: IntArray, n: Int): Pair<Int, Int> {
    val needLo = (5L * n + 999) / 1000
    val needHi = (995L * n + 999) / 1000
    var cum = 0L
    var lo = -1
    var hi = 255
    for (v in 0 until 256) {
      cum += hist[v]
      if (lo < 0 && cum >= needLo) lo = v
      if (cum >= needHi) {
        hi = v
        break
      }
    }
    return Pair(if (lo < 0) 0 else lo, hi)
  }

  fun levels(v: Int, lo: Int, hi: Int): Int = if (hi - lo < 32) v else clamp(divRound((v - lo).toLong() * 255, (hi - lo).toLong()))

  fun adjust(v: Int, brightness: Int, contrast: Int): Int {
    val shift = divRoundSigned(brightness.toLong() * 128, 100)
    return clamp(divRoundSigned((v - 128).toLong() * (100 + contrast) + 100 * (128 + shift), 100))
  }

  fun bwK(threshold: Int): Int = minOf(40, maxOf(0, 15 + divRoundSigned(threshold.toLong(), 10).toInt()))

  private fun integral(values: ByteArray, w: Int, h: Int): LongArray {
    val s = LongArray((w + 1) * (h + 1))
    for (y in 0 until h) {
      var row = 0L
      for (x in 0 until w) {
        row += values[y * w + x].toInt() and 0xFF
        s[(y + 1) * (w + 1) + x + 1] = s[y * (w + 1) + x + 1] + row
      }
    }
    return s
  }

  private inline fun forEachBox(s: LongArray, w: Int, h: Int, r: Int, fn: (Int, Long, Long) -> Unit) {
    val W = w + 1
    for (y in 0 until h) {
      val y0 = maxOf(0, y - r)
      val y1 = minOf(h, y + r + 1)
      val rowA = y0 * W
      val rowB = y1 * W
      val hh = y1 - y0
      for (x in 0 until w) {
        val x0 = maxOf(0, x - r)
        val x1 = minOf(w, x + r + 1)
        fn(y * w + x, s[rowB + x1] - s[rowA + x1] - s[rowB + x0] + s[rowA + x0], ((x1 - x0) * hh).toLong())
      }
    }
  }

  private fun lumaPlane(rgba: ByteArray, n: Int): ByteArray {
    val y = ByteArray(n)
    for (i in 0 until n) {
      y[i] = luma(rgba[4 * i].toInt() and 0xFF, rgba[4 * i + 1].toInt() and 0xFF, rgba[4 * i + 2].toInt() and 0xFF).toByte()
    }
    return y
  }

  private fun histogram(v: ByteArray): IntArray {
    val h = IntArray(256)
    for (b in v) h[b.toInt() and 0xFF]++
    return h
  }

  fun bwPlane(rgba: ByteArray, w: Int, h: Int, threshold: Int): ByteArray {
    val n = w * h
    val y = lumaPlane(rgba, n)
    val s = integral(y, w, h)
    val r = maxOf(4, minOf(w, h) / 40)
    val keep = (100 - bwK(threshold)).toLong()
    val out = ByteArray(n)
    forEachBox(s, w, h, r) { i, sum, area ->
      out[i] = if ((y[i].toInt() and 0xFF).toLong() * area * 100 < sum * keep) 0.toByte() else 255.toByte()
    }
    return out
  }

  /** The filter + sliders on RGBA (alpha ignored, set to 255), exactly as applyFilter in filters.ts. */
  fun apply(rgba: ByteArray, w: Int, h: Int, filter: String, brightness: Int, contrast: Int, threshold: Int): ByteArray {
    val n = w * h
    val out = ByteArray(n * 4) { 255.toByte() }
    val sliders = brightness != 0 || contrast != 0
    fun fin(v: Int): Byte = (if (sliders) adjust(v, brightness, contrast) else v).toByte()
    when (filter) {
      "bw" -> {
        val bw = bwPlane(rgba, w, h, threshold)
        for (i in 0 until n) {
          out[4 * i] = bw[i]; out[4 * i + 1] = bw[i]; out[4 * i + 2] = bw[i]
        }
      }
      "gray" -> {
        val y = lumaPlane(rgba, n)
        val (lo, hi) = percentiles(histogram(y), n)
        for (i in 0 until n) {
          val v = fin(levels(y[i].toInt() and 0xFF, lo, hi))
          out[4 * i] = v; out[4 * i + 1] = v; out[4 * i + 2] = v
        }
      }
      "auto" -> {
        val r = maxOf(8, minOf(w, h) / 16)
        val v = ByteArray(n * 3)
        val plane = ByteArray(n)
        for (c in 0 until 3) {
          for (i in 0 until n) plane[i] = rgba[4 * i + c]
          val s = integral(plane, w, h)
          forEachBox(s, w, h, r) { i, sum, area ->
            val m = maxOf(divRound(sum, area), 1L)
            v[3 * i + c] = clamp(divRound(255L * (plane[i].toInt() and 0xFF), m)).toByte()
          }
        }
        val yv = ByteArray(n)
        for (i in 0 until n) {
          yv[i] = luma(v[3 * i].toInt() and 0xFF, v[3 * i + 1].toInt() and 0xFF, v[3 * i + 2].toInt() and 0xFF).toByte()
        }
        val (lo, hi) = percentiles(histogram(yv), n)
        for (i in 0 until n) {
          out[4 * i] = fin(levels(v[3 * i].toInt() and 0xFF, lo, hi))
          out[4 * i + 1] = fin(levels(v[3 * i + 1].toInt() and 0xFF, lo, hi))
          out[4 * i + 2] = fin(levels(v[3 * i + 2].toInt() and 0xFF, lo, hi))
        }
      }
      else -> for (i in 0 until n) {
        out[4 * i] = fin(rgba[4 * i].toInt() and 0xFF)
        out[4 * i + 1] = fin(rgba[4 * i + 1].toInt() and 0xFF)
        out[4 * i + 2] = fin(rgba[4 * i + 2].toInt() and 0xFF)
      }
    }
    return out
  }
}
