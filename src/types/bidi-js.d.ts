/** Minimal typings for `bidi-js` (ships without its own declarations). */
declare module "bidi-js" {
  export type EmbeddingLevels = {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  };

  export type BidiApi = {
    /** Resolves Unicode Bidi Algorithm embedding levels for each UTF-16 code unit. */
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): EmbeddingLevels;
    getReorderSegments(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Array<[number, number]>;
    getReorderedIndices(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): number[];
    getReorderedString(text: string, embeddingLevels: EmbeddingLevels): string;
    /** Index -> replacement character for bidi-mirrored pairs such as brackets. */
    getMirroredCharactersMap(
      text: string,
      embeddingLevels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): Map<number, string>;
    getMirroredCharacter(char: string): string | null;
    getBidiCharType(char: string): number;
    getBidiCharTypeName(char: string): string;
  };

  export default function bidiFactory(): BidiApi;
}
