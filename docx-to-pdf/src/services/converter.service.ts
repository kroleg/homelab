import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { Logger } from '../logger.ts';

const execFileAsync = promisify(execFile);

export function createConverterService(logger: Logger) {
  return {
    async convertDocxToPdf(buffer: Buffer, originalName: string): Promise<{ pdf: Buffer; filename: string }> {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-to-pdf-'));

      try {
        const inputPath = path.join(tmpDir, originalName);
        await fs.writeFile(inputPath, buffer);

        logger.info(`Converting ${originalName} to PDF`);

        await execFileAsync('libreoffice', [
          '--headless',
          '--convert-to', 'pdf',
          '--outdir', tmpDir,
          inputPath,
        ], { timeout: 60_000 });

        const pdfName = originalName.replace(/\.docx?$/i, '.pdf');
        const pdfPath = path.join(tmpDir, pdfName);

        const pdf = await fs.readFile(pdfPath);
        logger.info(`Conversion complete: ${pdfName} (${pdf.length} bytes)`);

        return { pdf, filename: pdfName };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    },
  };
}

export type ConverterService = ReturnType<typeof createConverterService>;
