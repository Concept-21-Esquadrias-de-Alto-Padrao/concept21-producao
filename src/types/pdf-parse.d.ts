declare module "pdf-parse" {
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    text: string;
    version?: string;
  };

  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;

  export = pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfTextItem = { str: string; transform: number[] };
  type PdfPage = { getTextContent(options: { disableCombineTextItems: boolean }): Promise<{ items: PdfTextItem[] }> };
  type PdfParseResult = {
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    text: string;
    version?: string;
  };

  function pdfParse(dataBuffer: Buffer, options?: { pagerender?: (page: PdfPage) => Promise<string> }): Promise<PdfParseResult>;

  export = pdfParse;
}
