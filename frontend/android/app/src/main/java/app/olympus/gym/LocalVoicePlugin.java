package app.olympus.gym;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import java.util.ArrayList;
import java.util.List;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Olympus: the coaches' offline voices (sherpa-onnx with a Piper voice per language). A voice is
 * downloaded once (install), kept in the app's own files (files/voices/<lang>/: model.onnx,
 * tokens.txt, espeak-ng-data/) and read with on the phone: no quota, no connection, a sentence
 * ready in well under a second. Built and published by .github/workflows/voices.yml; used from
 * frontend/src/lib/local-voice.js.
 *
 * JS:
 *   get({ url })                          -> { text }  (the voices list, fetched here: no CORS)
 *   list()                                -> { langs: [...] }
 *   install({ lang, url, sha256 })        -> {}  with "progress" events { lang, received, total }
 *   remove({ lang })                      -> {}
 *   speak({ lang, text, sid, speed })     -> {}  when it has been read; a "start" event when the sound begins
 *   stop()                                -> {}
 */
@CapacitorPlugin(name = "LocalVoice")
public class LocalVoicePlugin extends Plugin {
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final Map<String, OfflineTts> engines = new HashMap<>();
    private volatile AudioTrack playing = null;
    private volatile int run = 0;

    private File root() {
        File d = new File(getContext().getFilesDir(), "voices");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static boolean safeLang(String lang) {
        return lang != null && lang.matches("[A-Za-z]{2,3}(-[A-Za-z]{2,4})?");
    }

    private boolean installed(String lang) {
        File d = new File(root(), lang);
        return new File(d, "model.onnx").isFile() && new File(d, "tokens.txt").isFile() && new File(d, "espeak-ng-data").isDirectory();
    }

    @PluginMethod
    public void get(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("an https address is needed"); return; }
        downloads.execute(() -> {
            try {
                HttpURLConnection c = open(url);
                try (InputStream in = new BufferedInputStream(c.getInputStream())) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[1 << 14];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        if (out.size() > 1_000_000) throw new Exception("too large");
                    }
                    JSObject r = new JSObject();
                    r.put("text", out.toString("UTF-8"));
                    call.resolve(r);
                } finally { c.disconnect(); }
            } catch (Exception e) { call.reject("could not fetch: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray langs = new JSArray();
        File[] all = root().listFiles();
        if (all != null) for (File d : all) if (d.isDirectory() && installed(d.getName())) langs.put(d.getName());
        JSObject r = new JSObject();
        r.put("langs", langs);
        call.resolve(r);
    }

    @PluginMethod
    public void install(PluginCall call) {
        String lang = call.getString("lang");
        String url = call.getString("url");
        String sha = call.getString("sha256", "");
        if (!safeLang(lang) || url == null || !url.startsWith("https://")) { call.reject("lang and an https url are needed"); return; }
        call.setKeepAlive(false);
        downloads.execute(() -> {
            File zip = new File(getContext().getCacheDir(), "voice-" + lang + ".zip");
            File tmp = new File(root(), lang + ".part");
            try {
                HttpURLConnection c = open(url);
                long total = c.getContentLengthLong();
                long got = 0, lastSent = 0;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream out = new FileOutputStream(zip)) {
                    byte[] buf = new byte[1 << 16];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        md.update(buf, 0, n);
                        got += n;
                        if (got - lastSent > 400_000) { lastSent = got; progress(lang, got, total); }
                    }
                } finally { c.disconnect(); }
                progress(lang, got, total);
                if (!sha.isEmpty() && !sha.equalsIgnoreCase(hex(md.digest()))) throw new Exception("the download is damaged (checksum)");
                deleteAll(tmp);
                unzip(zip, tmp);
                if (!new File(tmp, "model.onnx").isFile()) throw new Exception("the voice has no model");
                synchronized (engines) {
                    OfflineTts old = engines.remove(lang);
                    if (old != null) old.release();
                }
                File dest = new File(root(), lang);
                deleteAll(dest);
                if (!tmp.renameTo(dest)) throw new Exception("could not keep the voice");
                call.resolve();
            } catch (Exception e) {
                deleteAll(tmp);
                call.reject("the voice could not be installed: " + e.getMessage());
            } finally {
                zip.delete();
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String lang = call.getString("lang");
        if (!safeLang(lang)) { call.reject("lang is needed"); return; }
        synchronized (engines) {
            OfflineTts old = engines.remove(lang);
            if (old != null) old.release();
        }
        deleteAll(new File(root(), lang));
        call.resolve();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String lang = call.getString("lang");
        String text = call.getString("text", "");
        int sid = call.getInt("sid", 0);
        float speed = call.getFloat("speed", 1.0f);
        if (!safeLang(lang) || !installed(lang)) { call.reject("no voice for " + lang, "no-voice"); return; }
        if (text.trim().isEmpty()) { call.resolve(); return; }
        final int me = ++run;
        stopPlaying();
        work.execute(() -> {
            try {
                OfflineTts tts = engine(lang);
                // One sentence at a time: the first is heard while the next is made.
                List<String> parts = pieces(text);
                boolean started = false;
                for (String part : parts) {
                    if (me != run) break;
                    if (part.trim().isEmpty()) continue;
                    GeneratedAudio audio = tts.generate(part, sid, speed);
                    if (me != run) break;
                    if (!started) { started = true; notifyListeners("start", new JSObject()); }
                    play(audio.getSamples(), audio.getSampleRate(), me);
                }
                call.resolve();
            } catch (Throwable e) {
                call.reject("the voice failed: " + e.getMessage());
            }
        });
    }

    // The text as the voice can read it: no markdown or pictures (it would read them as noise), and
    // sentences cut at a comma when they run long (these voices babble on a very long stretch).
    static List<String> pieces(String text) {
        String clean = text
                .replaceAll("[\\p{So}\\p{Cn}\\p{Cs}*_#`~|<>\\[\\]{}\\\\]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        List<String> out = new ArrayList<>();
        for (String sentence : clean.split("(?<=[.!?…。！？])\\s+")) {
            String rest = sentence.trim();
            while (rest.length() > 160) {
                int cut = -1;
                for (int i = Math.min(rest.length() - 1, 160); i > 60; i--) {
                    char c = rest.charAt(i);
                    if (c == ',' || c == ';' || c == ':' || c == '，' || c == '、') { cut = i + 1; break; }
                }
                if (cut < 0) {
                    cut = rest.lastIndexOf(' ', 160);
                    if (cut < 60) cut = 160;
                }
                out.add(rest.substring(0, cut).trim());
                rest = rest.substring(cut).trim();
            }
            if (!rest.isEmpty()) out.add(rest);
        }
        return out;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        run++;
        stopPlaying();
        call.resolve();
    }

    private OfflineTts engine(String lang) {
        synchronized (engines) {
            OfflineTts tts = engines.get(lang);
            if (tts != null) return tts;
            File d = new File(root(), lang);
            OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
            vits.setModel(new File(d, "model.onnx").getAbsolutePath());
            vits.setTokens(new File(d, "tokens.txt").getAbsolutePath());
            vits.setDataDir(new File(d, "espeak-ng-data").getAbsolutePath());
            OfflineTtsModelConfig model = new OfflineTtsModelConfig();
            model.setVits(vits);
            model.setNumThreads(2);
            model.setProvider("cpu");
            OfflineTtsConfig config = new OfflineTtsConfig();
            config.setModel(model);
            tts = new OfflineTts(null, config);
            engines.put(lang, tts);
            return tts;
        }
    }

    // Plays the samples and returns once they have been heard (or stopped).
    private void play(float[] samples, int rate, int me) throws InterruptedException {
        if (samples == null || samples.length == 0) return;
        short[] pcm = new short[samples.length];
        for (int i = 0; i < samples.length; i++) {
            float s = Math.max(-1f, Math.min(1f, samples[i]));
            pcm[i] = (short) (s * 32767);
        }
        AudioTrack track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(pcm.length * 2)
                .build();
        playing = track;
        track.write(pcm, 0, pcm.length);
        track.play();
        long ms = (long) pcm.length * 1000L / rate;
        long until = System.currentTimeMillis() + ms + 150;
        while (System.currentTimeMillis() < until && me == run) Thread.sleep(40);
        try { track.stop(); } catch (Exception ignored) { }
        track.release();
        if (playing == track) playing = null;
    }

    private void stopPlaying() {
        AudioTrack t = playing;
        playing = null;
        if (t != null) {
            try { t.pause(); t.flush(); } catch (Exception ignored) { }
        }
    }

    private void progress(String lang, long got, long total) {
        JSObject p = new JSObject();
        p.put("lang", lang);
        p.put("received", got);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private static HttpURLConnection open(String url) throws Exception {
        // GitHub sends a release file from another host: the redirects are followed by hand, https only.
        String at = url;
        for (int hops = 0; hops < 6; hops++) {
            HttpURLConnection c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "Olympus-Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null || !next.startsWith("https://")) throw new Exception("bad redirect");
                at = next;
                continue;
            }
            if (code != 200) { c.disconnect(); throw new Exception("HTTP " + code); }
            return c;
        }
        throw new Exception("too many redirects");
    }

    private static void unzip(File zip, File dest) throws Exception {
        dest.mkdirs();
        String base = dest.getCanonicalPath() + File.separator;
        try (ZipInputStream in = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
            byte[] buf = new byte[1 << 16];
            for (ZipEntry e; (e = in.getNextEntry()) != null; ) {
                File f = new File(dest, e.getName());
                if (!f.getCanonicalPath().startsWith(base)) throw new Exception("bad entry " + e.getName());
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(f)) {
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                }
            }
        }
    }

    private static void deleteAll(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteAll(k);
        f.delete();
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
