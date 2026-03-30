import { logger } from './logger';
import { pb } from './pocketbase';

/**
 * Downloads an image from a URL (HTTP or data:) and uploads it as a file
 * to a PocketBase record. Returns the uploaded filename, or null on failure.
 */
export async function uploadImageToRecord(collection: string, recordId: string, fieldName: string, source: string): Promise<string | null> {
  try {
    let blob: Blob;
    let filename: string;

    if (source.startsWith('data:')) {
      const match = source.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) {
        return null;
      }
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = mimeType.split('/')[1]?.split('+')[0] ?? 'jpg';
      blob = new Blob([buffer], { type: mimeType });
      filename = `${fieldName}.${ext}`;
    } else {
      const response = await fetch(source);
      if (!response.ok) {
        return null;
      }
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
      blob = new Blob([buffer], { type: contentType });
      filename = `${fieldName}.${ext}`;
    }

    const formData = new FormData();
    formData.append(fieldName, blob, filename);
    const record = await pb.collection(collection).update(recordId, formData);
    return (record[fieldName] as string) ?? null;
  } catch (error) {
    logger.warn(`[image-upload] Failed to upload ${fieldName} for ${collection}/${recordId}: ${error}`);
    return null;
  }
}
