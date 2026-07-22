Vendored from zxing-wasm v3.1.2 (https://github.com/Sec-ant/zxing-wasm),
which wraps zxing-cpp (Apache-2.0). Files:
  zxing-reader.js    – ESM reader bundle (esbuild, from dist/es/reader)
  zxing_reader.wasm  – WebAssembly decoder binary
Used as an on-device barcode-decoding fallback where the native
BarcodeDetector API is unavailable (e.g. iOS Safari).
