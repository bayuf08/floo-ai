// Minimal ambient declaration for `unpdf` — the package ships ESM but no
// .d.ts, so vue-tsc reports `TS7016: Could not find a declaration file`.
// We only use `getDocumentProxy` and `extractText` from `server/utils/asset-content.ts`,
// so the surface area we need to declare is small.
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
}
