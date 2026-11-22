package app.olympus.gym;

/**
 * Olympus: when the coaches' offline voice (LocalVoicePlugin) starts to sound, and how long a
 * piece of text is expected to last. Pure arithmetic, no Android, so it is unit tested
 * (SpeechPacingTest).
 *
 * The voice is made one piece (a sentence or a clause) at a time, and the next piece is made while
 * the one before it plays. Making a piece takes about `rtf` seconds per second of sound. Where
 * rtf is under 1 the voice keeps ahead of what is heard. Where it is not (Kokoro on a mid-range
 * phone), starting as soon as the first piece is ready leaves a silence before the second piece
 * as long as the difference. That is the "I am awake. ... long wait ... rest of the sentence" the
 * person heard. So where rtf is under 1 the sound starts once the sound already made covers the
 * time the next piece is expected to take, and any gap left is at most `TOLERANCE_S`. Where it is
 * over 1 no wait removes the gaps, and the sound starts with the first piece.
 *
 * Measured with sherpa-onnx 1.13.8 and the kokoro-int8-multi-lang-v1_0 pack (4 threads, a 2.1 GHz
 * Xeon, 2026-11-21): making a piece took 0.21 s + 0.81 s per second of sound, and a piece lasted
 * 0.33 s + 0.045 s per character at speed 1. The phone's own rtf is learned as it speaks.
 */
final class SpeechPacing {
    private SpeechPacing() { }

    /** Seconds of sound of a piece of `chars` characters at speed 1 (measured, see above). */
    static final double FIXED_S = 0.33;
    static final double PER_CHAR_S = 0.045;
    /**
     * The longest silence the start rule accepts before the next piece, on top of the pause that
     * belongs there. In the measured speech, pauses at a full stop ranged 180 to 340 ms: a further
     * 0.3 s stays within the range people use between sentences.
     */
    static final double TOLERANCE_S = 0.3;
    /** The rtf assumed before any measurement on this phone: as slow as real time (assumption). */
    static final double FIRST_RTF = 1.0;
    /** How much a new measurement weighs in the running estimate. */
    static final double WEIGHT = 0.5;

    /** The expected seconds of sound of `chars` characters read at `speed` (1 = the voice's own pace). */
    static double expectedSeconds(int chars, double speed) {
        if (chars <= 0) return 0;
        double s = speed > 0 ? speed : 1;
        return (FIXED_S + PER_CHAR_S * chars) / s;
    }

    /**
     * Whether the sound should start now: `buffered` seconds of sound (pauses included) are ready
     * and not yet heard, the next piece has `nextChars` characters (0 or less: nothing comes next),
     * and making it is expected to take `rtf` times its length.
     */
    static boolean shouldStart(double buffered, int nextChars, double speed, double rtf) {
        if (nextChars <= 0) return true;
        double r = rtf > 0 ? rtf : FIRST_RTF;
        // Slower than real time: the answer ends at the same moment however long the start waits
        // (each piece is ready only when it is ready), so waiting only moves silence from the
        // middle to the start, where it was heard as the coach not answering (Build 93,
        // 2026-11-22). The sound starts with the first piece.
        if (r > 1) return true;
        return buffered + TOLERANCE_S >= r * expectedSeconds(nextChars, speed);
    }

    /**
     * The shortest piece that counts towards rtf. A piece also costs a fixed 0.21 s (measured): on a
     * half-second piece that alone adds 40% and would make a fast phone look slower than real time,
     * which now changes when the sound starts. From 1.5 s on it adds at most 14%.
     */
    static final double MEASURE_MIN_S = 1.5;

    /** The running rtf after one piece took `genSeconds` to make and lasts `soundSeconds`. */
    static double updateRtf(double previous, double genSeconds, double soundSeconds) {
        if (!(soundSeconds >= MEASURE_MIN_S) || !(genSeconds >= 0)) return previous;
        double now = genSeconds / soundSeconds;
        return previous > 0 ? (1 - WEIGHT) * previous + WEIGHT * now : now;
    }

    /** Silence, in samples at `rate`, for a pause of `ms` milliseconds (none below 0). */
    static int pauseSamples(int ms, int rate) {
        if (ms <= 0 || rate <= 0) return 0;
        return (int) Math.round(Math.min(ms, 2000) * rate / 1000.0);
    }
}
