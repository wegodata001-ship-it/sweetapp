import {
  type BusinessDocumentCategory,
  isStorageResourceExistsError,
  StorageResourceExistsError,
  uploadBusinessDocument,
} from "@/lib/storage/business-documents";

export type ScanUploadResult = {
  bucket: string;
  storagePath: string;
  fileName: string;
  fileType: string;
  viewUrl: string | null;
};

/**
 * Upload source file to pdf_photo before Gemini analysis.
 * Returns null on non-fatal storage errors — scan continues without saved file.
 */
export async function uploadScanSourceFile(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  category: BusinessDocumentCategory = "ocr",
): Promise<ScanUploadResult | null> {
  try {
    const uploaded = await uploadBusinessDocument({
      buffer,
      fileName,
      contentType,
      category,
    });
    return {
      bucket: uploaded.bucket,
      storagePath: uploaded.storagePath,
      fileName: uploaded.fileName,
      fileType: uploaded.fileType,
      viewUrl: uploaded.viewUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof StorageResourceExistsError || isStorageResourceExistsError(msg)) {
      console.warn(
        "[uploadScanSourceFile] resource already exists — continuing scan without storage",
        e instanceof StorageResourceExistsError ? e.storagePath : fileName,
      );
      return null;
    }
    console.warn("[uploadScanSourceFile] upload failed — continuing scan without storage", msg);
    return null;
  }
}
