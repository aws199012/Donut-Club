import fs from 'node:fs/promises';
import path from 'node:path';

export async function extractText(filepath, mimeType) {
  const ext = path.extname(filepath).toLowerCase();

  try {
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await fs.readFile(filepath);
      const result = await pdfParse(buffer);
      return result.text;
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ path: filepath });
      return result.value;
    }

    if (ext === '.txt' || ext === '.md' || mimeType?.startsWith('text/')) {
      return await fs.readFile(filepath, 'utf-8');
    }
  } catch (err) {
    console.error(`Text extraction failed for ${filepath}:`, err.message);
    return '';
  }

  // Images and other binary types: no text extraction in the MVP.
  return '';
}
