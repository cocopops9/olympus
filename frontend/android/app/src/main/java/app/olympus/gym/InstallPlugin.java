package app.olympus.gym;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import com.getcapacitor.JSObject;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;

/**
 * Minimal local Capacitor plugin that opens the Android package installer
 * for an APK file stored in the app's cache directory.
 *
 * Usage from JS:
 *   import { registerPlugin } from '@capacitor/core';
 *   const Install = registerPlugin('Install');
 *   await Install.installApk({ fileName: 'opengym-update.apk', sha256: '<64 hex>' });
 *
 * With `sha256` the file is streamed through SHA-256 first and a mismatch is refused (and the
 * file deleted) before the installer opens: the APK is ~300 MB, too big to hash in the WebView.
 */
@CapacitorPlugin(name = "Install")
public class InstallPlugin extends Plugin {

    @PluginMethod
    public void installApk(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("fileName is required");
            return;
        }

        // A download made by startDownload sits in the app's own external files, the others in cache.
        File file = "downloads".equals(call.getString("place"))
                ? new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                : new File(getContext().getCacheDir(), fileName);
        if (!file.exists()) {
            call.reject("APK file not found: " + fileName);
            return;
        }

        String expected = call.getString("sha256");
        if (expected != null && !expected.isEmpty()) {
            try {
                if (!expected.equalsIgnoreCase(sha256(file))) {
                    file.delete();
                    call.reject("SHA-256 mismatch: the download may be corrupted or tampered with");
                    return;
                }
            } catch (Exception e) {
                call.reject("Could not check the download: " + e.getMessage());
                return;
            }
        }

        Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
        );

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

        getContext().startActivity(intent);
        call.resolve();
    }

    /*
     * The update's download goes through Android's DownloadManager, not through the app: the system
     * keeps it going while the app is in the background, the screen is locked or the app is closed,
     * and shows its own notification. The app only asks how far it got, or cancels it.
     */
    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");
        if (url == null || fileName == null || fileName.isEmpty() || fileName.contains("/")) {
            call.reject("url and fileName are required");
            return;
        }
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            call.reject("no storage for the download");
            return;
        }
        File old = new File(dir, fileName);
        if (old.exists()) old.delete();
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle(call.getString("title", "Olympus"))
                .setDescription(call.getString("description", ""))
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);
        long id = manager().enqueue(request);
        JSObject out = new JSObject();
        out.put("id", String.valueOf(id));
        call.resolve(out);
    }

    @PluginMethod
    public void downloadStatus(PluginCall call) {
        long id = idOf(call);
        JSObject out = new JSObject();
        try (Cursor c = manager().query(new DownloadManager.Query().setFilterById(id))) {
            if (c == null || !c.moveToFirst()) {
                out.put("status", "missing");
                call.resolve(out);
                return;
            }
            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            out.put("bytes", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
            out.put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
            out.put("reason", c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
            switch (status) {
                case DownloadManager.STATUS_SUCCESSFUL: out.put("status", "done"); break;
                case DownloadManager.STATUS_FAILED: out.put("status", "failed"); break;
                case DownloadManager.STATUS_PAUSED: out.put("status", "paused"); break;
                case DownloadManager.STATUS_PENDING: out.put("status", "pending"); break;
                default: out.put("status", "running");
            }
            call.resolve(out);
        } catch (Exception e) {
            call.reject("could not read the download: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        manager().remove(idOf(call));
        call.resolve();
    }

    private DownloadManager manager() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private static long idOf(PluginCall call) {
        try { return Long.parseLong(call.getString("id", "-1")); } catch (NumberFormatException e) { return -1; }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[1 << 16];
        try (InputStream in = new FileInputStream(file)) {
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}
