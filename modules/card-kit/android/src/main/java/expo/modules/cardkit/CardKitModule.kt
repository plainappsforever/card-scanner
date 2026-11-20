package expo.modules.cardkit

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

class RenderOptions : Record {
  @Field val src: String = ""
  @Field val out: String = ""
  @Field val quad: List<Map<String, Double>>? = null
  @Field val width: Int? = null
  @Field val height: Int? = null
  @Field val maxSide: Int? = null
  @Field val filter: String = "original"
  @Field val brightness: Int = 0
  @Field val contrast: Int = 0
  @Field val threshold: Int = 0
  @Field val quality: Double = 0.9
}

class RecognizeOptions : Record {
  @Field val langs: List<String> = listOf()
  @Field val rotation: Int = 0
}

class ScanOptions : Record {
  @Field val pageLimit: Int? = null
}

// card-kit (SPEC §6.1, D11): a COPY of Offscan's scan-kit (~/Developer/pdf-scanner/modules/scan-kit at commit 79218b7,
// verified on Offscan's Android emulator), trimmed for cards (no PDF functions, no 1-bit packing) and extended with
// detectBarcodes (ML Kit barcode scanning, BUNDLED model). AsyncFunctions run off the main thread unless they start UI.
class CardKitModule : Module() {
  private var pendingScan: Promise? = null
  private val recognizers = mutableMapOf<String, TextRecognizer>()

  override fun definition() = ModuleDefinition {
    Name("CardKit")

    // Play services' document scanner installed? Missing → a background download is requested for next time and the
    // caller uses the fallback camera now (warranty-wallet D33: launching it anyway shows "Something went wrong").
    AsyncFunction("scannerStatus") { promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.resolve("unavailable")
      try {
        val scanner = GmsDocumentScanning.getClient(GmsDocumentScannerOptions.Builder().build())
        val client = ModuleInstall.getClient(context)
        client.areModulesAvailable(scanner)
          .addOnSuccessListener { r ->
            if (r.areModulesAvailable()) promise.resolve("ready")
            else {
              client.deferredInstall(scanner)
              promise.resolve("downloading")
            }
          }
          .addOnFailureListener { promise.resolve("unavailable") }
      } catch (e: Exception) {
        promise.resolve("unavailable")
      }
    }

    // ML Kit document scanner, FULL mode, gallery import on, JPEG pages copied into the app's cache.
    AsyncFunction("scanDocument") { options: ScanOptions, promise: Promise ->
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.reject("E_NO_ACTIVITY", "No activity", null)
      if (pendingScan != null) return@AsyncFunction promise.reject("E_BUSY", "The scanner is already open", null)
      val builder = GmsDocumentScannerOptions.Builder()
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .setGalleryImportAllowed(true)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
      options.pageLimit?.let { if (it > 0) builder.setPageLimit(it) }
      GmsDocumentScanning.getClient(builder.build()).getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          pendingScan = promise
          try {
            activity.startIntentSenderForResult(sender, SCAN_REQUEST, null, 0, 0, 0)
          } catch (e: Exception) {
            pendingScan = null
            promise.reject("E_SCAN_FAILED", "Could not start the scanner: ${e.message}", e)
          }
        }
        .addOnFailureListener { e -> promise.reject("E_SCANNER_UNAVAILABLE", "The document scanner is not available: ${e.message}", e) }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != SCAN_REQUEST) return@OnActivityResult
      val promise = pendingScan ?: return@OnActivityResult
      pendingScan = null
      if (payload.resultCode != Activity.RESULT_OK) {
        promise.resolve(mapOf("status" to "cancel", "pages" to listOf<Any>()))
        return@OnActivityResult
      }
      try {
        val result = GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
        val context = appContext.reactContext ?: throw CodedException("E_NO_CONTEXT", "No context", null)
        val dir = File(context.cacheDir, "scans").apply { mkdirs() }
        val stamp = UUID.randomUUID().toString()
        val pages = (result?.pages ?: listOf()).mapIndexed { i, page ->
          val dest = File(dir, "scan-$stamp-$i.jpg")
          context.contentResolver.openInputStream(page.imageUri).use { input ->
            FileOutputStream(dest).use { out -> input?.copyTo(out) ?: throw CodedException("E_SCAN_FAILED", "Page ${i + 1} unreadable", null) }
          }
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeFile(dest.path, bounds)
          mapOf("uri" to Uri.fromFile(dest).toString(), "w" to bounds.outWidth, "h" to bounds.outHeight)
        }
        promise.resolve(mapOf("status" to "ok", "pages" to pages))
      } catch (e: Exception) {
        promise.reject("E_SCAN_FAILED", "Could not read the scan: ${e.message}", e)
      }
    }

    // No system segmentation on Android: the JS detector (src/engine/detect.ts) runs on grayThumbnail.
    AsyncFunction("detectDocument") { _: String -> null as List<Map<String, Double>>? }

    // Upright gray thumbnail, long edge ≤ maxSide, by area averaging (like CoreGraphics' .high in the fixtures).
    AsyncFunction("grayThumbnail") { uri: String, maxSide: Int ->
      val bitmap = loadUpright(uri, maxSide * 2)
      try {
        val (w, h) = fit(bitmap.width, bitmap.height, maxSide)
        val px = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(px, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val gray = areaAverageLuma(px, bitmap.width, bitmap.height, w, h)
        mapOf("w" to w, "h" to h, "base64" to Base64.encodeToString(gray, Base64.NO_WRAP))
      } finally {
        bitmap.recycle()
      }
    }

    AsyncFunction("normalizeImport") { uri: String, out: String, maxSide: Int ->
      val bitmap = scaleTo(loadUpright(uri, maxSide), maxSide)
      try {
        writeJpeg(bitmap, out, 0.92)
        mapOf("w" to bitmap.width, "h" to bitmap.height)
      } finally {
        bitmap.recycle()
      }
    }

    // source → (warp by quad) → filter → sliders → JPEG (SPEC §5.3; rotation is never baked).
    AsyncFunction("render") { o: RenderOptions ->
      var image = loadUpright(o.src, 0)
      val quad = o.quad
      if (quad != null && quad.size == 4) {
        image = warp(image, quad, o.width, o.height).also { image.recycle() }
      } else if (o.width != null && o.height != null && o.width > 0 && o.height > 0 && (o.width != image.width || o.height != image.height)) {
        image = Bitmap.createScaledBitmap(image, o.width, o.height, true).also { if (it !== image) image.recycle() }
      }
      o.maxSide?.let { if (it > 0) image = scaleTo(image, it) }
      val identity = o.filter == "original" && o.brightness == 0 && o.contrast == 0
      if (!identity) {
        val rgba = toRgba(image)
        val w = image.width
        val h = image.height
        image.recycle()
        image = fromRgba(Filters.apply(rgba, w, h, o.filter, o.brightness, o.contrast, o.threshold), w, h)
      }
      try {
        writeJpeg(image, o.out, o.quality)
        mapOf("w" to image.width, "h" to image.height)
      } finally {
        image.recycle()
      }
    }

    AsyncFunction("exportJpeg") { src: String, out: String, maxSide: Int, quality: Double ->
      val bitmap = scaleTo(loadUpright(src, 0), maxSide)
      try {
        writeJpeg(bitmap, out, quality)
        mapOf("w" to bitmap.width, "h" to bitmap.height)
      } finally {
        bitmap.recycle()
      }
    }

    // ML Kit (SPEC §5.7 RawMlkit): blocks → lines → elements with corner points in pixels of the image as displayed
    // (rotated by `rotation`; the caller unrotates). One recogniser per requested script, results concatenated.
    AsyncFunction("recognize") { uri: String, options: RecognizeOptions, promise: Promise ->
      val bitmap = try {
        loadUpright(uri, 0)
      } catch (e: Exception) {
        return@AsyncFunction promise.reject("E_IMAGE", "Could not open the image: ${e.message}", e)
      }
      val r = ((options.rotation % 360) + 360) % 360
      val image = InputImage.fromBitmap(bitmap, r)
      val turned = r % 180 != 0
      val width = if (turned) bitmap.height else bitmap.width
      val height = if (turned) bitmap.width else bitmap.height
      // ML Kit reads the image turned by `r` but returns corner points in the UNROTATED bitmap's pixels (measured on the
      // emulator, P6–P8 device phase). The JS contract (like Vision) is the displayed frame: turn each point clockwise.
      val w0 = bitmap.width.toDouble()
      val h0 = bitmap.height.toDouble()
      fun shown(p: android.graphics.Point): Map<String, Double> {
        val x = p.x.toDouble()
        val y = p.y.toDouble()
        return when (r) {
          90 -> mapOf("x" to h0 - y, "y" to x)
          180 -> mapOf("x" to w0 - x, "y" to h0 - y)
          270 -> mapOf("x" to y, "y" to w0 - x)
          else -> mapOf("x" to x, "y" to y)
        }
      }
      val scripts = options.langs.ifEmpty { listOf("latin") }.distinct()
      val blocks = mutableListOf<Map<String, Any>>()
      fun next(i: Int) {
        if (i >= scripts.size) {
          bitmap.recycle()
          promise.resolve(mapOf("engine" to "mlkit", "langs" to scripts, "width" to width, "height" to height, "blocks" to blocks))
          return
        }
        val recognizer = try {
          recognizerFor(scripts[i])
        } catch (e: Exception) {
          bitmap.recycle()
          return promise.reject("E_UNSUPPORTED", "No recogniser for ${scripts[i]}", e)
        }
        recognizer.process(image)
          .addOnSuccessListener { text ->
            for (block in text.textBlocks) {
              blocks.add(
                mapOf(
                  "text" to block.text,
                  "lines" to block.lines.map { line ->
                    mapOf(
                      "text" to line.text,
                      "confidence" to line.confidence.toDouble(),
                      "cornerPoints" to (line.cornerPoints ?: arrayOf()).map { shown(it) },
                      "elements" to line.elements.map { el ->
                        mapOf("text" to el.text, "cornerPoints" to (el.cornerPoints ?: arrayOf()).map { shown(it) })
                      }
                    )
                  }
                )
              )
            }
            next(i + 1)
          }
          .addOnFailureListener { e ->
            bitmap.recycle()
            // An unbundled script (Chinese, Devanagari, Japanese, Korean) whose model Google Play services has not
            // downloaded yet fails with UNAVAILABLE ("Waiting for the text optional module to be downloaded"): a
            // temporary state, reported as E_MODEL_PENDING so the queue retries later instead of failing the page.
            if (e is MlKitException && e.errorCode == MlKitException.UNAVAILABLE) {
              promise.reject("E_MODEL_PENDING", "Model for ${scripts[i]} not downloaded yet: ${e.message}", e)
            } else {
              promise.reject("E_RECOGNIZE", "Recognition failed (${scripts[i]}): ${e.message}", e)
            }
          }
      }
      next(0)
    }

    // Scripts compiled in (Latin bundled; the others are Play-services models). Russian/Arabic: no Tesseract in this
    // build (its language files need a download the owner has not approved) → "unsupported" (L11, V1_LOG P6).
    AsyncFunction("ocrLanguages") { -> listOf("latin", "chinese", "devanagari", "japanese", "korean") }

    // Printed codes (SPEC §6.1): QR, Aztec, Data Matrix, PDF417 with the BUNDLED ML Kit model (no Play-services
    // download). Raw payload text (+ bytes), box normalised with a top-left origin in the upright image.
    AsyncFunction("detectBarcodes") { uri: String, promise: Promise ->
      val bitmap = try {
        loadUpright(uri, 0)
      } catch (e: Exception) {
        return@AsyncFunction promise.reject("E_IMAGE", "Could not open the image: ${e.message}", e)
      }
      val w = bitmap.width.toDouble()
      val h = bitmap.height.toDouble()
      val options = BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_AZTEC, Barcode.FORMAT_DATA_MATRIX, Barcode.FORMAT_PDF417)
        .build()
      val scanner = BarcodeScanning.getClient(options)
      scanner.process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { codes ->
          val out = codes.map { c ->
            val b = c.boundingBox
            val item = mutableMapOf<String, Any>(
              "format" to when (c.format) {
                Barcode.FORMAT_QR_CODE -> "qr"
                Barcode.FORMAT_AZTEC -> "aztec"
                Barcode.FORMAT_DATA_MATRIX -> "datamatrix"
                Barcode.FORMAT_PDF417 -> "pdf417"
                else -> "other"
              },
              "text" to (c.rawValue ?: ""),
              "box" to if (b != null) mapOf("x" to b.left / w, "y" to b.top / h, "w" to b.width() / w, "h" to b.height() / h) else mapOf("x" to 0.0, "y" to 0.0, "w" to 0.0, "h" to 0.0),
            )
            c.rawBytes?.let { item["bytesBase64"] = Base64.encodeToString(it, Base64.NO_WRAP) }
            item
          }
          bitmap.recycle()
          scanner.close()
          promise.resolve(out)
        }
        .addOnFailureListener { e ->
          bitmap.recycle()
          scanner.close()
          promise.reject("E_BARCODE", e.message ?: "Barcode detection failed", e)
        }
    }

    // safe-share's chooser: content:// URIs (FileProvider) with a read grant.
    AsyncFunction("shareFiles") { uris: List<String>, mimeTypes: List<String>, title: String ->
      val activity = appContext.currentActivity ?: throw CodedException("E_NO_ACTIVITY", "No activity", null)
      if (uris.isEmpty()) return@AsyncFunction false
      val list = ArrayList(uris.map { Uri.parse(it) })
      val intent = if (list.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, list[0])
      else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, list)
      intent.type = mimeTypes.distinct().singleOrNull() ?: "*/*"
      val clip = ClipData.newRawUri("", list[0])
      for (u in list.drop(1)) clip.addItem(ClipData.Item(u))
      intent.clipData = clip
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivity(Intent.createChooser(intent, title))
      true
    }.runOnQueue(Queues.MAIN)

    // Self-test (dev route): the filter port on raw RGBA, compared with the TS reference in JS.
    AsyncFunction("filterRgba") { base64: String, width: Int, height: Int, filter: String, brightness: Int, contrast: Int, threshold: Int ->
      val data = Base64.decode(base64, Base64.DEFAULT)
      if (data.size != width * height * 4) throw CodedException("E_IMAGE", "Bad RGBA input", null)
      Base64.encodeToString(Filters.apply(data, width, height, filter, brightness, contrast, threshold), Base64.NO_WRAP)
    }

    OnDestroy {
      recognizers.values.forEach { it.close() }
      recognizers.clear()
    }
  }

  private fun recognizerFor(script: String): TextRecognizer = recognizers.getOrPut(script) {
    when (script) {
      "latin" -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      "chinese" -> TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
      "devanagari" -> TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
      "japanese" -> TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
      "korean" -> TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
      else -> throw CodedException("E_UNSUPPORTED", "No recogniser for $script", null)
    }
  }

  // ---- Images ----

  private fun toFile(uri: String): File {
    val parsed = Uri.parse(uri)
    return File(if (parsed.scheme == "file") parsed.path ?: uri else uri)
  }

  private fun fit(w: Int, h: Int, maxSide: Int): Pair<Int, Int> {
    val long = max(w, h)
    if (maxSide <= 0 || long <= maxSide) return Pair(w, h)
    val s = maxSide.toDouble() / long
    return Pair(max(1, (w * s).roundToInt()), max(1, (h * s).roundToInt()))
  }

  /** Decodes upright (EXIF orientation applied); `atLeast` > 0 lets the decoder subsample down to about that long edge. */
  private fun loadUpright(uri: String, atLeast: Int): Bitmap {
    val file = toFile(uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0) throw CodedException("E_IMAGE", "Could not open the image at $uri", null)
    var sample = 1
    if (atLeast > 0) while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= atLeast) sample *= 2
    val opts = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val raw = BitmapFactory.decodeFile(file.path, opts) ?: throw CodedException("E_IMAGE", "Could not decode $uri", null)
    val orientation = try {
      ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    val m = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(270f); m.postScale(-1f, 1f) }
      else -> return raw
    }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true).also { if (it !== raw) raw.recycle() }
  }

  private fun scaleTo(bitmap: Bitmap, maxSide: Int): Bitmap {
    val (w, h) = fit(bitmap.width, bitmap.height, maxSide)
    if (w == bitmap.width && h == bitmap.height) return bitmap
    return Bitmap.createScaledBitmap(bitmap, w, h, true).also { if (it !== bitmap) bitmap.recycle() }
  }

  /** Matrix.setPolyToPoly from the normalised quad (top-left origin) onto width × height (SPEC §6). */
  private fun warp(src: Bitmap, quad: List<Map<String, Double>>, width: Int?, height: Int?): Bitmap {
    val sw = src.width.toFloat()
    val sh = src.height.toFloat()
    val pts = FloatArray(8)
    for (i in 0 until 4) {
      pts[2 * i] = ((quad[i]["x"] ?: 0.0) * sw).toFloat()
      pts[2 * i + 1] = ((quad[i]["y"] ?: 0.0) * sh).toFloat()
    }
    val w = width ?: src.width
    val h = height ?: src.height
    val dst = floatArrayOf(0f, 0f, w.toFloat(), 0f, w.toFloat(), h.toFloat(), 0f, h.toFloat())
    val m = Matrix()
    if (!m.setPolyToPoly(pts, 0, dst, 0, 4)) throw CodedException("E_IMAGE", "Bad crop corners", null)
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    Canvas(out).drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    return out
  }

  private fun toRgba(bitmap: Bitmap): ByteArray {
    val w = bitmap.width
    val h = bitmap.height
    val px = IntArray(w * h)
    bitmap.getPixels(px, 0, w, 0, 0, w, h)
    val out = ByteArray(w * h * 4)
    for (i in 0 until w * h) {
      val c = px[i]
      out[4 * i] = Color.red(c).toByte()
      out[4 * i + 1] = Color.green(c).toByte()
      out[4 * i + 2] = Color.blue(c).toByte()
      out[4 * i + 3] = 255.toByte()
    }
    return out
  }

  private fun fromRgba(rgba: ByteArray, w: Int, h: Int): Bitmap {
    val px = IntArray(w * h) { i ->
      Color.argb(255, rgba[4 * i].toInt() and 0xFF, rgba[4 * i + 1].toInt() and 0xFF, rgba[4 * i + 2].toInt() and 0xFF)
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }

  /** Luma per source pixel, averaged over each target cell with fractional coverage (area averaging). */
  private fun areaAverageLuma(px: IntArray, sw: Int, sh: Int, tw: Int, th: Int): ByteArray {
    val out = ByteArray(tw * th)
    val fx = sw.toDouble() / tw
    val fy = sh.toDouble() / th
    for (ty in 0 until th) {
      val y0 = ty * fy
      val y1 = (ty + 1) * fy
      for (tx in 0 until tw) {
        val x0 = tx * fx
        val x1 = (tx + 1) * fx
        var sum = 0.0
        var area = 0.0
        var y = y0.toInt()
        while (y < y1 && y < sh) {
          val wy = minOf(y + 1.0, y1) - maxOf(y.toDouble(), y0)
          var x = x0.toInt()
          while (x < x1 && x < sw) {
            val wx = minOf(x + 1.0, x1) - maxOf(x.toDouble(), x0)
            val c = px[y * sw + x]
            sum += wx * wy * Filters.luma(Color.red(c), Color.green(c), Color.blue(c))
            area += wx * wy
            x++
          }
          y++
        }
        out[ty * tw + tx] = (if (area > 0) (sum / area).roundToInt() else 0).coerceIn(0, 255).toByte()
      }
    }
    return out
  }

  private fun writeJpeg(bitmap: Bitmap, out: String, quality: Double) {
    val file = toFile(out)
    file.parentFile?.mkdirs()
    FileOutputStream(file).use { stream ->
      if (!bitmap.compress(Bitmap.CompressFormat.JPEG, (quality * 100).roundToInt().coerceIn(1, 100), stream)) {
        throw CodedException("E_IMAGE", "Could not write $out", null)
      }
    }
  }

  companion object {
    private const val SCAN_REQUEST = 4917
  }
}
