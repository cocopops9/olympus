package app.olympus.gym;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
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
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig;
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
 *   speak({ lang, text, sid, speed, parts })  -> { firstMs, rtf, … }  when it has been heard; a "start"
 *                                         event when the sound begins (with `model`: "m1", "m2"… a model
 *                                         of a coaches pack; `parts`: [{ text, pause }], the pieces to read
 *                                         and the milliseconds of silence after each, lib/speech-text.js)
 *   warm({ lang, accent, model, sid, speed, pitch, parts })  -> { loaded, loadMs, rtf }  the engine
 *                                         made ready ahead, and with `parts` the first pieces of a line
 *                                         about to be said made too (speak then plays them at once)
 *
 * A coaches pack (lang "coaches-de": voice-coaches-de.zip, .github/voices/coach-pack.py) holds the
 * Piper voices of the coaches who do not read with the language's own one: a folder per model
 * (m1/model.onnx, m1/tokens.txt) and the espeak-ng data they share. At most two of its engines are
 * kept in memory (each is some tens of MB), the ones read with last.
 *
 * A voice that reads letters, not sounds (a file named `characters` beside its model, written by
 * .github/voices/piper_text.py) is given the text in lower case and no espeak-ng data.
 *   stop()                                -> {}
 *   audioNormal()                         -> { was }  the phone's audio back out of "call" mode
 *
 * audioNormal: while the WebView has the microphone open, Android puts the audio in call mode
 * (MODE_IN_COMMUNICATION, voice processing on the output). The WebView puts it back by itself
 * once the microphone is closed, but on some phones only seconds later, and music playing
 * meanwhile sounds thin, with a heavy echo. The app calls this right after it closes the
 * microphone (lib/voice.js releaseMic, lib/voice-note.js), so the music sounds right at once.
 */
@CapacitorPlugin(name = "LocalVoice")
public class LocalVoicePlugin extends Plugin {
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final Map<String, OfflineTts> engines = new HashMap<>();
    private volatile Playback playback = null;
    private volatile int run = 0;

    private File root() {
        File d = new File(getContext().getFilesDir(), "voices");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static boolean safeLang(String lang) {
        // A language's Piper voice ("it", "pt-BR"), or the one Kokoro pack shared by its languages.
        // Or the coaches' own voices of a language ("coaches-de").
        return lang != null && (lang.equals("kokoro") || lang.matches("(coaches-)?[A-Za-z]{2,3}(-[A-Za-z]{2,4})?"));
    }

    private static boolean isCoaches(String lang) { return lang.startsWith("coaches-"); }

    private static boolean safeModel(String m) { return m != null && m.matches("m[1-9]"); }

    // A folder with a voice in it: its model and tokens, and espeak-ng data unless it reads letters.
    private static boolean hasVoice(File d, File espeak) {
        return new File(d, "model.onnx").isFile() && new File(d, "tokens.txt").isFile()
                && (new File(d, "characters").isFile() || espeak.isDirectory());
    }

    private boolean installed(String lang) {
        File d = new File(root(), lang);
        File espeak = new File(d, "espeak-ng-data");
        return isCoaches(lang) ? hasVoice(new File(d, "m1"), espeak) : hasVoice(d, espeak);
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
                if (!new File(isCoaches(lang) ? new File(tmp, "m1") : tmp, "model.onnx").isFile()) throw new Exception("the voice has no model");
                synchronized (engines) {
                    OfflineTts old = engines.remove(lang);
                    dropVariants(lang);
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
            dropVariants(lang);
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
        // Olympus: `pitch` (0.8 to 1.2) plays the voice lower or higher: it is played at that share
        // of its rate, and made faster or slower by as much, so its pace stays the one asked for.
        // Two coaches reading with the same model sound like two people. `accent`: the espeak-ng
        // language a Kokoro voice reads with ("es", "fr-fr", "it", "hi", "pt-br"); empty for the
        // English and Chinese ones, which read with their own lexicons.
        float pitch = Math.max(0.8f, Math.min(1.2f, call.getFloat("pitch", 1.0f)));
        String accent = call.getString("accent", "");
        if (accent == null || !accent.matches("[a-z-]{0,8}")) accent = "";
        String model = call.getString("model", "");
        if (!safeLang(lang) || !installed(lang)) { call.reject("no voice for " + lang, "no-voice"); return; }
        if (isCoaches(lang) && (!safeModel(model) || !hasVoice(new File(new File(root(), lang), model), new File(new File(root(), lang), "espeak-ng-data")))) {
            call.reject("no such voice in " + lang, "no-voice"); return;
        }
        // The pieces to read and the pause after each (lib/speech-text.js), or the text cut here.
        List<String> parts = new ArrayList<>();
        List<Integer> pauses = new ArrayList<>();
        JSArray given = call.getArray("parts");
        if (given != null && given.length() > 0) {
            for (int i = 0; i < given.length() && i < 400; i++) {
                org.json.JSONObject o = given.optJSONObject(i);
                if (o == null) continue;
                String t = o.optString("text", "");
                if (t.trim().isEmpty()) continue;
                parts.add(t);
                pauses.add(Math.max(0, Math.min(2000, o.optInt("pause", 0))));
            }
        } else {
            for (String t : pieces(text)) { parts.add(t); pauses.add(SENTENCE_PAUSE_MS); }
        }
        if (parts.isEmpty()) { call.resolve(); return; }
        final String acc = accent;
        final String mod = isCoaches(lang) ? model : "";
        final float genSpeed = speed / pitch;
        final int me = ++run;
        stopPlaying();
        work.execute(() -> {
            Playback out = null;
            try {
                long t0 = System.nanoTime();
                String key = engineKey(lang, acc, mod);
                OfflineTts tts = engine(lang, acc, mod);
                boolean letters = new File(voiceDir(lang, mod), "characters").isFile();
                double loadS = (System.nanoTime() - t0) / 1e9;
                double genTotal = 0, firstS = -1;
                // One piece at a time, the next one made while the one before it is heard. The sound
                // starts once what is ready covers the time the next piece takes to make
                // (SpeechPacing), so it does not stop for long in the middle.
                for (int i = 0; i < parts.size(); i++) {
                    if (me != run) break;
                    String part = parts.get(i);
                    String said = letters ? part.toLowerCase(java.util.Locale.ROOT) : part;
                    Made made = takeMade(madeKey(key, sid, genSpeed, said));
                    if (made == null) {
                        long g0 = System.nanoTime();
                        GeneratedAudio audio = tts.generate(said, sid, genSpeed);
                        double genS = (System.nanoTime() - g0) / 1e9;
                        genTotal += genS;
                        made = new Made(audio.getSamples(), audio.getSampleRate());
                        if (made.samples != null && made.samples.length > 0) rtfs.put(key, SpeechPacing.updateRtf(rtfOf(key), genS, made.samples.length / (double) made.rate));
                    }
                    if (me != run) break;
                    float[] samples = made.samples;
                    if (samples == null || samples.length == 0) continue;
                    int rate = Math.round(made.rate * pitch);
                    if (out == null) { out = new Playback(rate, me); playback = out; }
                    boolean last = i == parts.size() - 1;
                    out.add(samples, last ? 0 : SpeechPacing.pauseSamples(pauses.get(i), rate));
                    // A next piece made ahead (warm with `parts`) costs no time.
                    int nextChars = last ? 0 : hasMade(madeKey(key, sid, genSpeed, letters ? parts.get(i + 1).toLowerCase(java.util.Locale.ROOT) : parts.get(i + 1))) ? 0 : parts.get(i + 1).length();
                    if (!out.started() && SpeechPacing.shouldStart(out.bufferedSeconds(), nextChars, speed, rtfOf(key))) {
                        out.start();
                        firstS = (System.nanoTime() - t0) / 1e9;
                    }
                }
                if (out != null && me == run) {
                    if (!out.started()) { out.start(); firstS = (System.nanoTime() - t0) / 1e9; }
                    out.finish();
                    out.awaitEnd();
                }
                JSObject r = new JSObject();
                r.put("loadMs", Math.round(loadS * 1000));
                r.put("firstMs", Math.round(firstS * 1000));
                r.put("rtf", Math.round(rtfOf(key) * 100) / 100.0);
                r.put("genMs", Math.round(genTotal * 1000));
                r.put("parts", parts.size());
                r.put("stopped", me != run);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("the voice failed: " + e.getMessage());
            } finally {
                if (out != null) { out.cancel(); out.release(); if (playback == out) playback = null; }
            }
        });
    }

    /**
     * Makes the engine of a voice ready before it is needed: the model read from storage and run
     * once, which on the first answer otherwise comes before the first word. Asked for when a coach
     * is about to talk (Chiron getting up, voice mode turned on). Same arguments as speak, no text.
     */
    @PluginMethod
    public void warm(PluginCall call) {
        String lang = call.getString("lang");
        String accent = call.getString("accent", "");
        if (accent == null || !accent.matches("[a-z-]{0,8}")) accent = "";
        String model = call.getString("model", "");
        int sid = call.getInt("sid", 0);
        float speed = call.getFloat("speed", 1.0f);
        float pitch = Math.max(0.8f, Math.min(1.2f, call.getFloat("pitch", 1.0f)));
        final float genSpeed = speed / pitch;
        // `parts`: the first pieces of a line about to be said (Chiron's greeting), made now.
        List<String> ahead = new ArrayList<>();
        JSArray given = call.getArray("parts");
        if (given != null) {
            for (int i = 0; i < given.length() && ahead.size() < MADE_MAX; i++) {
                org.json.JSONObject o = given.optJSONObject(i);
                String t = o == null ? "" : o.optString("text", "");
                if (!t.trim().isEmpty()) ahead.add(t);
            }
        }
        if (!safeLang(lang) || !installed(lang)) { call.reject("no voice for " + lang, "no-voice"); return; }
        final String acc = accent;
        final String mod = isCoaches(lang) ? (safeModel(model) ? model : "") : "";
        if (isCoaches(lang) && mod.isEmpty()) { call.reject("no such voice in " + lang, "no-voice"); return; }
        work.execute(() -> {
            try {
                long t0 = System.nanoTime();
                String key = engineKey(lang, acc, mod);
                boolean had = hasEngine(key);
                OfflineTts tts = engine(lang, acc, mod);
                double loadS = (System.nanoTime() - t0) / 1e9;
                JSObject r = new JSObject();
                r.put("loaded", !had);
                r.put("loadMs", Math.round(loadS * 1000));
                boolean letters = new File(voiceDir(lang, mod), "characters").isFile();
                if (!had && ahead.isEmpty()) {
                    // One short line, thrown away: the first run of a model is slower than the next.
                    String line = "Ok, let's go.";
                    long g0 = System.nanoTime();
                    GeneratedAudio a = tts.generate(letters ? line.toLowerCase(java.util.Locale.ROOT) : line, sid, 1.0f);
                    double genS = (System.nanoTime() - g0) / 1e9;
                    float[] s = a.getSamples();
                    if (s != null && s.length > 0) rtfs.put(key, SpeechPacing.updateRtf(rtfOf(key), genS, s.length / (double) a.getSampleRate()));
                    r.put("warmMs", Math.round(genS * 1000));
                }
                long a0 = System.nanoTime();
                for (String part : ahead) {
                    String said = letters ? part.toLowerCase(java.util.Locale.ROOT) : part;
                    String mk = madeKey(key, sid, genSpeed, said);
                    if (hasMade(mk)) continue;
                    long g0 = System.nanoTime();
                    GeneratedAudio a = tts.generate(said, sid, genSpeed);
                    double genS = (System.nanoTime() - g0) / 1e9;
                    Made m = new Made(a.getSamples(), a.getSampleRate());
                    if (m.samples != null && m.samples.length > 0) rtfs.put(key, SpeechPacing.updateRtf(rtfOf(key), genS, m.samples.length / (double) m.rate));
                    putMade(mk, m);
                }
                if (!ahead.isEmpty()) r.put("aheadMs", Math.round((System.nanoTime() - a0) / 1e6));
                r.put("rtf", Math.round(rtfOf(key) * 100) / 100.0);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("the voice failed: " + e.getMessage());
            }
        });
    }

    // Pieces made ahead of being said (warm with `parts`), each used once. A few at most: one line.
    private static final int MADE_MAX = 4;
    private static final class Made {
        final float[] samples; final int rate;
        Made(float[] samples, int rate) { this.samples = samples; this.rate = rate; }
    }
    private final java.util.LinkedHashMap<String, Made> made = new java.util.LinkedHashMap<>();
    private static String madeKey(String engine, int sid, float genSpeed, String text) {
        return engine + "|" + sid + "|" + Math.round(genSpeed * 1000) + "|" + text;
    }
    private boolean hasMade(String k) { synchronized (made) { return made.containsKey(k); } }
    private Made takeMade(String k) { synchronized (made) { return made.remove(k); } }
    private void putMade(String k, Made m) {
        synchronized (made) {
            made.put(k, m);
            while (made.size() > MADE_MAX) made.remove(made.keySet().iterator().next());
        }
    }

    // The pause after a piece cut here (no pieces from the app): about a sentence's.
    private static final int SENTENCE_PAUSE_MS = 150;

    // How fast each engine makes its sound (seconds to make one second of it), learned as it speaks.
    private final Map<String, Double> rtfs = new java.util.concurrent.ConcurrentHashMap<>();
    private double rtfOf(String key) { Double r = rtfs.get(key); return r == null ? SpeechPacing.FIRST_RTF : r; }

    /**
     * One answer's sound: a streaming AudioTrack fed from a queue by a thread of its own, so each
     * piece follows the one before it with only the pause it is given, and a piece is being made
     * while another plays. Nothing is heard before start(); awaitEnd() returns once the last sample
     * has been played, so the microphone only opens after the voice has really finished.
     */
    private final class Playback {
        private final int rate;
        private final int me;
        private final AudioTrack track;
        private final java.util.concurrent.LinkedBlockingQueue<short[]> queue = new java.util.concurrent.LinkedBlockingQueue<>();
        private final short[] END = new short[0];
        private volatile boolean started = false, cancelled = false;
        private long queuedFrames = 0;        // written to the queue
        private Thread feeder = null;

        Playback(int rate, int me) {
            this.rate = rate;
            this.me = me;
            int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(min * 2, rate / 4 * 2))   // at least a quarter of a second
                    .build();
        }

        boolean started() { return started; }

        /** Seconds of sound queued and not yet heard. */
        double bufferedSeconds() {
            long heard = started ? Math.max(0, track.getPlaybackHeadPosition() & 0xffffffffL) : 0;
            return Math.max(0, queuedFrames - heard) / (double) rate;
        }

        void add(float[] samples, int pauseFrames) {
            short[] pcm = new short[samples.length + pauseFrames];
            for (int i = 0; i < samples.length; i++) {
                float s = Math.max(-1f, Math.min(1f, samples[i]));
                pcm[i] = (short) (s * 32767);
            }
            queuedFrames += pcm.length;
            queue.add(pcm);
        }

        void start() {
            if (started) return;
            started = true;
            track.play();
            notifyListeners("start", new JSObject());
            feeder = new Thread(() -> {
                try {
                    while (!cancelled && me == run) {
                        short[] pcm = queue.take();
                        if (pcm == END) break;
                        int off = 0;
                        while (off < pcm.length && !cancelled && me == run) {
                            int n = track.write(pcm, off, pcm.length - off);
                            if (n <= 0) return;
                            off += n;
                        }
                    }
                } catch (Throwable ignored) {
                    // Stopped (interrupted), or the track released under it: nothing more to play.
                }
            }, "olympus-voice");
            feeder.start();
        }

        private long endFrames = 0;

        /**
         * Nothing more comes. A quarter of a second of silence follows the last word, so the track's
         * start threshold never holds back the end of it; it is not waited for (awaitEnd).
         */
        void finish() {
            endFrames = queuedFrames;
            queue.add(new short[rate / 4]);
            queue.add(END);
        }

        /** Returns once the last word has been played, or the answer was stopped. */
        void awaitEnd() throws InterruptedException {
            // A safety for a track that stops moving: the time left to play, and a second more.
            long until = System.currentTimeMillis() + endFrames * 1000L / rate + 1000;
            while (!cancelled && me == run && System.currentTimeMillis() < until) {
                long head = track.getPlaybackHeadPosition() & 0xffffffffL;
                if (head >= endFrames) break;
                Thread.sleep(20);
            }
            // The last few milliseconds leave the speaker after the head has passed them.
            if (!cancelled && me == run) Thread.sleep(60);
            cancel();
        }

        void cancel() {
            if (cancelled) return;
            cancelled = true;
            queue.clear();
            queue.add(END);
            try { track.pause(); track.flush(); } catch (Exception ignored) { }
            if (feeder != null) feeder.interrupt();
        }

        void release() {
            // The feeder leaves its write once the track is paused and flushed (cancel); the track
            // is released after it, not under it.
            try { if (feeder != null) feeder.join(300); } catch (InterruptedException ignored) { }
            try { track.release(); } catch (Exception ignored) { }
        }
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
    public void audioNormal(PluginCall call) {
        JSObject out = new JSObject();
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            int was = am.getMode();
            out.put("was", was);
            if (Build.VERSION.SDK_INT >= 31) {
                try { am.clearCommunicationDevice(); } catch (Exception ignored) { }
            }
            if (was != AudioManager.MODE_NORMAL) am.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception e) {
            out.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        run++;
        stopPlaying();
        call.resolve();
    }

    // A Kokoro pack (voices.bin beside the model) or a Piper voice. A Kokoro engine is made per
    // espeak-ng language it reads with, since that is part of its configuration.
    private File voiceDir(String lang, String model) {
        File d = new File(root(), lang);
        return model.isEmpty() ? d : new File(d, model);
    }

    // The engines of coaches packs, the one read with last at the end.
    private final List<String> coachEngines = new ArrayList<>();

    private String engineKey(String lang, String accent, String modelDir) {
        boolean kokoro = new File(voiceDir(lang, modelDir), "voices.bin").isFile();
        return kokoro ? lang + "|" + accent : modelDir.isEmpty() ? lang : lang + "|" + modelDir;
    }

    private boolean hasEngine(String key) { synchronized (engines) { return engines.containsKey(key); } }

    // Threads for a voice: one per fast core. Phones have 4 fast cores and 4 slow ones at most
    // (big.LITTLE); a thread on a slow core holds up the others at every step. Measured on a
    // server: 4 threads made Kokoro 16% faster than 2.
    private static int threads() {
        int n = Runtime.getRuntime().availableProcessors() / 2;
        return Math.max(2, Math.min(4, n));
    }

    private OfflineTts engine(String lang, String accent, String modelDir) {
        File d = voiceDir(lang, modelDir);
        File espeak = new File(new File(root(), lang), "espeak-ng-data");
        boolean kokoro = new File(d, "voices.bin").isFile();
        String key = engineKey(lang, accent, modelDir);
        synchronized (engines) {
            OfflineTts tts = engines.get(key);
            if (!modelDir.isEmpty()) {
                coachEngines.remove(key);
                coachEngines.add(key);
                // Two at most: the oldest one goes.
                while (coachEngines.size() > 2) {
                    OfflineTts old = engines.remove(coachEngines.remove(0));
                    if (old != null) old.release();
                }
            }
            if (tts != null) return tts;
            OfflineTtsModelConfig model = new OfflineTtsModelConfig();
            if (kokoro) {
                OfflineTtsKokoroModelConfig k = new OfflineTtsKokoroModelConfig();
                k.setModel(new File(d, "model.onnx").getAbsolutePath());
                k.setVoices(new File(d, "voices.bin").getAbsolutePath());
                k.setTokens(new File(d, "tokens.txt").getAbsolutePath());
                k.setDataDir(new File(d, "espeak-ng-data").getAbsolutePath());
                List<String> lex = new ArrayList<>();
                for (String f : new String[] { "lexicon-us-en.txt", "lexicon-zh.txt" }) {
                    File lf = new File(d, f);
                    if (lf.isFile()) lex.add(lf.getAbsolutePath());
                }
                if (!lex.isEmpty()) k.setLexicon(String.join(",", lex));
                File dict = new File(d, "dict");
                if (dict.isDirectory()) k.setDictDir(dict.getAbsolutePath());
                if (!accent.isEmpty()) k.setLang(accent);
                model.setKokoro(k);
            } else {
                OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
                vits.setModel(new File(d, "model.onnx").getAbsolutePath());
                vits.setTokens(new File(d, "tokens.txt").getAbsolutePath());
                if (!new File(d, "characters").isFile()) vits.setDataDir(espeak.getAbsolutePath());
                model.setVits(vits);
            }
            model.setNumThreads(threads());
            model.setProvider("cpu");
            OfflineTtsConfig config = new OfflineTtsConfig();
            config.setModel(model);
            tts = new OfflineTts(null, config);
            engines.put(key, tts);
            return tts;
        }
    }

    // The Kokoro engines of a pack, one per accent, when the pack is replaced or removed.
    private void dropVariants(String lang) {
        synchronized (engines) {
            coachEngines.removeIf(k -> k.startsWith(lang + "|"));
            engines.keySet().removeIf(k -> {
                if (!k.startsWith(lang + "|")) return false;
                try { engines.get(k).release(); } catch (Exception ignored) { }
                return true;
            });
        }
    }

    private void stopPlaying() {
        Playback p = playback;
        playback = null;
        if (p != null) p.cancel();
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
