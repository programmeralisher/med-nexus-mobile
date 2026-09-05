import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { jsPDF } from "jspdf";

/**
 * Saves or shares a generated jsPDF document -- branches on platform so the
 * existing web/desktop behavior is completely unchanged, and Android (via
 * Capacitor) gets a path that actually works in a WebView.
 *
 * Web/desktop (Capacitor.isNativePlatform() === false -- every deployment
 * today, and every non-native visit to the same deployed app once Android
 * packaging exists too): calls doc.save(filename) exactly as before, the
 * browser's normal Blob + <a download> mechanism. Zero behavior change here.
 *
 * Native Android: jsPDF's own .save() relies on that same browser
 * download-link trick, which is unreliable inside an Android WebView (there
 * is no Downloads-folder pipeline wired up the way a real browser tab has
 * one -- confirmed in the pre-Phase-9 audit). Instead, this writes the PDF's
 * bytes to the app's private cache directory via @capacitor/filesystem
 * (Directory.Cache needs no runtime storage permission on any Android
 * version, unlike Directory.Documents/ExternalStorage) and immediately hands
 * the resulting file:// URI to @capacitor/share's native Share Sheet, so the
 * person picks where it actually goes -- Files, Drive, WhatsApp, etc. This
 * is the standard Capacitor pattern for "let the user save a generated
 * file," and does not change what the PDF itself contains in any way.
 */
export async function saveOrSharePdf(doc: jsPDF, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename);
    return;
  }

  const dataUri = doc.output("datauristring", { filename });
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({ title: filename, url: uri });
}
