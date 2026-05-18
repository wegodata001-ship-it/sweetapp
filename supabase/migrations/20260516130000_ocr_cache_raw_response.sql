-- Store truncated OCR.space API response for debugging (optional column)
ALTER TABLE ocr_cache ADD COLUMN IF NOT EXISTS "rawResponse" TEXT;
