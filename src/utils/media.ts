import * as ImageManipulator from 'expo-image-manipulator';

/** Normalize iPhone HEIC/AVIF and large camera images to the JPEG format accepted by the API. */
export async function normalizeImageForUpload(uri: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1920 } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 },
      ),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Görsel hazırlama zaman aşımına uğradı.')), 30000);
      }),
    ]);
    return { uri: result.uri, fileName: 'mindmatch-image.jpg', mimeType: 'image/jpeg' };
  } catch (error) {
    // 1. Yedek: Yeniden boyutlandırmadan doğrudan JPEG formatına dönüştürmeyi dene
    try {
      const fallback = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 },
      );
      return { uri: fallback.uri, fileName: 'mindmatch-image.jpg', mimeType: 'image/jpeg' };
    } catch {
      // 2. Yedek: Orijinal URI ile devam et
      const lower = uri.toLowerCase();
      const isPng = lower.endsWith('.png');
      return {
        uri,
        fileName: isPng ? 'mindmatch-image.png' : 'mindmatch-image.jpg',
        mimeType: isPng ? 'image/png' : 'image/jpeg'
      };
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function uploadFailureMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Dosya yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.';
  const status = 'status' in error ? Number(error.status) : null;
  if (status === 0) return error.message || 'Sunucuya ulaşılamadı. API bağlantısını kontrol edip tekrar dene.';
  if (status === 413) return 'Dosya çok büyük. Daha küçük bir görsel veya kısa bir video seç.';
  if (status === 429) return 'Çok sık yükleme yapıldı. Biraz bekleyip tekrar dene.';
  // File picker, image conversion, and local file reads can fail before the
  // request reaches the API. Preserve those errors instead of blaming the server.
  return error.message || 'Dosya yüklenemedi. Tekrar dene.';
}
