// card-kit: this app's local Expo module (SPEC §6.1, D11) — a COPY of Offscan's scan-kit (commit 79218b7), trimmed
// (no PDF functions, no 1-bit packing) plus detectBarcodes. iOS: VisionKit, Vision, CoreImage. Android: ML Kit document
// scanner, text recognition and barcode scanning (bundled), Bitmap/Matrix. Every function is an AsyncFunction (off the
// main thread unless it presents UI); URIs are file:// (Android shareFiles: content://). Errors are coded exceptions.
import { requireNativeModule } from 'expo';

import type { RawMlkit, RawVision } from '@/engine/ocr';

export type ScannerStatus = 'ready' | 'downloading' | 'unavailable';
export type ScannedPage = { uri: string; w: number; h: number };
export type ScanResult = { status: 'ok' | 'cancel'; pages: ScannedPage[] };
export type NativeQuad = [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
export type RenderOptions = {
  src: string;
  out: string;
  /** Normalised corners [TL, TR, BR, BL] in the upright source (top-left origin); null = whole image. */
  quad?: NativeQuad | null;
  width?: number;
  height?: number;
  maxSide?: number;
  filter: 'original';
  brightness: number;
  contrast: number;
  threshold: number;
  /** JPEG quality 0…1. */
  quality: number;
};
export type RecognizeOptions = {
  /** Vision codes (iOS) or ML Kit scripts (Android: latin, chinese, devanagari, japanese, korean). */
  langs: string[];
  /** Display rotation of the image (clockwise degrees). */
  rotation: number;
};
export type DetectedCode = { format: string; text: string; bytesBase64?: string; box: { x: number; y: number; w: number; h: number } };

type CardKit = {
  scannerStatus(): Promise<ScannerStatus>;
  scanDocument(options: { pageLimit?: number }): Promise<ScanResult>;
  /** iOS: VNDetectDocumentSegmentationRequest (normalised, top-left origin). Android: always null (JS detector). */
  detectDocument(uri: string): Promise<NativeQuad | null>;
  /** Upright gray thumbnail, long edge ≤ maxSide, area-averaged; base64 of w·h gray bytes. */
  grayThumbnail(uri: string, maxSide: number): Promise<{ w: number; h: number; base64: string }>;
  /** Decodes upright (EXIF orientation applied), long edge ≤ maxSide, re-encodes JPEG (q 0.92) without metadata. */
  normalizeImport(uri: string, out: string, maxSide: number): Promise<{ w: number; h: number }>;
  render(options: RenderOptions): Promise<{ w: number; h: number }>;
  exportJpeg(src: string, out: string, maxSide: number, quality: number): Promise<{ w: number; h: number }>;
  recognize(uri: string, options: RecognizeOptions): Promise<RawVision | RawMlkit>;
  /** iOS: Vision codes. Android: ML Kit scripts compiled in. */
  ocrLanguages(): Promise<string[]>;
  /** QR / Aztec / Data Matrix / PDF417 codes in the upright image. */
  detectBarcodes(uri: string): Promise<DetectedCode[]>;
  shareFiles(uris: string[], mimeTypes: string[], title: string): Promise<boolean>;
};

export default requireNativeModule<CardKit>('CardKit');
