package app.olympus.gym;

import static org.junit.Assert.*;

import org.junit.Test;

/** When the offline voice starts to sound (SpeechPacing), checked on a simulated answer. */
public class SpeechPacingTest {
    /**
     * Plays `chars` (one entry per piece, a pause of `pauseS` after each but the last) as
     * LocalVoicePlugin does: each piece is made after the one before it, taking rtf times its
     * length, and the sound starts when SpeechPacing says so. Returns { seconds to the first sound,
     * longest silence between pieces beyond its pause }.
     */
    private static double[] simulate(int[] chars, double rtf, double pauseS) {
        double now = 0, buffered = 0, playEnd = -1, first = -1, worstGap = 0;
        double[] ready = new double[chars.length];
        double[] length = new double[chars.length];
        for (int i = 0; i < chars.length; i++) {
            length[i] = SpeechPacing.expectedSeconds(chars[i], 1);
            now += rtf * length[i];
            ready[i] = now;
        }
        // Start: once what is ready covers the next piece's making.
        for (int i = 0; i < chars.length; i++) {
            buffered += length[i] + (i < chars.length - 1 ? pauseS : 0);
            int next = i + 1 < chars.length ? chars[i + 1] : 0;
            if (SpeechPacing.shouldStart(buffered, next, 1, rtf)) { first = ready[i]; break; }
        }
        // Play everything from `first`: a piece starts when it is ready and the one before has ended.
        playEnd = first;
        for (int i = 0; i < chars.length; i++) {
            double begin = Math.max(playEnd, ready[i]);
            if (i > 0) worstGap = Math.max(worstGap, begin - playEnd);
            playEnd = begin + length[i] + (i < chars.length - 1 ? pauseS : 0);
        }
        return new double[] { first, worstGap };
    }

    // "I am awake." then "Start an exercise and ask me anything about it."
    private static final int[] AWAKE = { 11, 47 };

    @Test
    public void aFastPhoneStartsWithTheFirstSentence() {
        double[] r = simulate(AWAKE, 0.3, 0.15);
        assertEquals(0.3 * SpeechPacing.expectedSeconds(11, 1), r[0], 1e-9);
        assertEquals(0, r[1], 1e-9);
    }

    @Test
    public void aPhoneAsFastAsRealTimeWaitsForTheSecondSentenceInsteadOfStoppingAfterTheFirst() {
        // As slow as real time: starting after "I am awake." would leave a silence of about 1.5 s.
        double eager = SpeechPacing.expectedSeconds(47, 1) - SpeechPacing.expectedSeconds(11, 1) - 0.15;
        assertTrue(eager > 1.0);
        double[] r = simulate(AWAKE, 1.0, 0.15);
        assertEquals(SpeechPacing.expectedSeconds(11, 1) + SpeechPacing.expectedSeconds(47, 1), r[0], 1e-9);
        assertEquals(0, r[1], 1e-9);
    }

    /** When the last piece ends: the same whatever the start rule, once the voice is slower than real time. */
    private static double endOf(int[] chars, double rtf, double pauseS, boolean waitForAll) {
        double ready = 0, end = 0;
        for (int i = 0; i < chars.length; i++) ready += rtf * SpeechPacing.expectedSeconds(chars[i], 1);
        double t = 0;
        double playEnd = -1;
        double made = 0;
        for (int i = 0; i < chars.length; i++) {
            made += rtf * SpeechPacing.expectedSeconds(chars[i], 1);
            double begin = waitForAll ? Math.max(ready, playEnd) : Math.max(made, playEnd);
            if (playEnd < 0) begin = waitForAll ? ready : made;
            playEnd = begin + SpeechPacing.expectedSeconds(chars[i], 1) + (i < chars.length - 1 ? pauseS : 0);
        }
        return playEnd;
    }

    @Test
    public void aPhoneSlowerThanRealTimeStartsWithTheFirstPieceSinceWaitingDoesNotEndItSooner() {
        int[] answer = { 18, 53, 11, 40, 38, 48, 55, 117, 74 };
        double[] r = simulate(answer, 1.6, 0.35);
        assertEquals(1.6 * SpeechPacing.expectedSeconds(18, 1), r[0], 1e-9);
        // Waiting until everything is made would end at the same moment or later.
        assertTrue(endOf(answer, 1.6, 0.35, false) <= endOf(answer, 1.6, 0.35, true) + 1e-9);
    }

    @Test
    public void upToRealTimeNoSilenceBetweenPiecesIsLongerThanTheTolerance() {
        int[] answer = { 40, 90, 60, 120, 30, 80 };
        for (double rtf : new double[] { 0.2, 0.5, 0.8, 1.0 }) {   // up to real time
            double[] r = simulate(answer, rtf, 0.15);
            assertTrue("rtf " + rtf + " gap " + r[1], r[1] <= SpeechPacing.TOLERANCE_S + 1e-9);
        }
    }

    @Test
    public void theRunningEstimateMovesHalfWayToEachMeasurement() {
        assertEquals(2.0, SpeechPacing.updateRtf(0, 4, 2), 1e-9);
        assertEquals(1.5, SpeechPacing.updateRtf(2.0, 2, 2), 1e-9);
        // A piece too short to measure (fixed costs dominate) leaves it as it was.
        assertEquals(1.5, SpeechPacing.updateRtf(1.5, 0.5, 0.1), 1e-9);
        assertEquals(1.5, SpeechPacing.updateRtf(1.5, 0.9, 0.6), 1e-9);
    }

    @Test
    public void nothingNextMeansStartNow() {
        assertTrue(SpeechPacing.shouldStart(0.2, 0, 1, 5));
    }

    @Test
    public void aFasterVoiceIsShorter() {
        assertTrue(SpeechPacing.expectedSeconds(50, 1.2) < SpeechPacing.expectedSeconds(50, 1));
        assertEquals(0, SpeechPacing.expectedSeconds(0, 1), 0);
    }

    @Test
    public void pausesAreSamplesAtTheRateAndCapped() {
        assertEquals(3600, SpeechPacing.pauseSamples(150, 24000));
        assertEquals(48000, SpeechPacing.pauseSamples(5000, 24000));
        assertEquals(0, SpeechPacing.pauseSamples(-1, 24000));
    }
}
