// Minimal ambient declaration for `unpdf` — the package ships ESM but no
// .d.ts, so vue-tsc reports `TS7016: Could not find a declaration file`.
// We only use `getDocumentProxy`, `extractText`, and `definePDFJSModule`
// from `server/utils/asset-content.ts`, so the surface area is small.
declare module 'unpdf' {
  /** Returns a PDF.js-like document proxy for further processing. */
  export function getDocumentProxy(buf: ArrayBuffer | Uint8Array): Promise<unknown>

  /**
   * Extracts text from the document. With `mergePages: true` the result's
   * `text` is a single string; without it, an array of per-page strings.
   */
  export function extractText(
    doc: unknown,
    opts?: { mergePages?: boolean },
  ): Promise<{ text: string | string[] }>

  /**
   * Tells unpdf which PDF.js build to lazy-load. We point this at the
   * standalone `pdfjs-serverless` package because unpdf 1.6.0's bundled
   * `unpdf/pdfjs` ships a minified file that fails to parse on Node.
   */
  export function definePDFJSModule(loader: () => Promise<unknown>): Promise<void>
}

declare module 'pdfjs-serverless' {
  // The default export shape isn't important — we just hand it back to
  // unpdf's `definePDFJSModule` loader.
  const mod: unknown
  export default mod
}
