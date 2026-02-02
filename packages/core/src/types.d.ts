declare module '@mozilla/readability' {
  export class Readability {
    constructor(doc: Document, options?: { charThreshold?: number });
    parse(): {
      title: string;
      byline: string | null;
      dir: string | null;
      content: string;
      textContent: string;
      length: number;
      excerpt: string;
      siteName: string | null;
    } | null;
  }
}

declare module 'epub-gen-memory' {
  interface Chapter {
    title: string;
    content: string;
    filename?: string;
  }

  interface Options {
    title: string;
    author?: string;
    publisher?: string;
    date?: string;
    css?: string;
    tocTitle?: string;
    appendChapterTitles?: boolean;
  }

  export default function EPub(options: Options, chapters: Chapter[]): Promise<Uint8Array>;
}
