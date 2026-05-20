/** Stubs until npm install completes — replaced by real types from node_modules. */
declare module "@google-cloud/vision" {
  export class ImageAnnotatorClient {
    constructor(opts?: { credentials?: Record<string, unknown> });
    documentTextDetection(req: {
      image: { content: Buffer };
      imageContext?: { languageHints?: string[] };
    }): Promise<[Record<string, unknown>]>;
  }
}

declare module "fuse.js" {
  export default class Fuse<T> {
    constructor(list: T[], options?: Record<string, unknown>);
    search(pattern: string): Array<{ item: T; score?: number }>;
  }
}
