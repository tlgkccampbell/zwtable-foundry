import { DEFAULT_PIXEL_COUNTS, TABLE_POSITIONS } from "./const.js";
import { ZerowhaleTableApi } from "./api.js";
import { ZerowhaleTableLog } from "./log.js";
import { ZerowhaleTableSettings } from "./settings.js";

/**
 * Where the strips are, physically.
 *
 * Positions run clockwise around the table, so the strips form one closed ring of LEDs. An
 * effect which is supposed to travel around the table -- the initiative sweep -- has to know
 * three things the table server cannot tell it on its own: how long each strip is, where each
 * one starts within the ring, and which way round each one was wired.
 *
 * The lengths come from the server. The wiring direction is a fact about the installation, so
 * it is a setting; a strip whose first LED sits at its clockwise-exit end rather than its
 * clockwise-entry end is "reversed". Get it wrong and a wave reflects at that strip's edges
 * instead of flowing across them.
 */
export class ZerowhaleTableGeometry {
    static #pixelCounts = null;

    /** Reads the strip lengths from the table server, so they are not duplicated here. */
    static async load() {
        const status = await ZerowhaleTableApi.getStatus();
        if (!Array.isArray(status) || !status.length) {
            ZerowhaleTableLog.debug("Could not read strip lengths from the table; using defaults.");
            return false;
        }

        const counts = new Array(TABLE_POSITIONS).fill(0);
        for (const board of status) {
            const index = Number(board?.deviceIndex);
            const count = Number(board?.devicePixelCount);
            if (Number.isInteger(index) && index >= 0 && index < TABLE_POSITIONS && count > 0) {
                counts[index] = count;
            }
        }

        if (counts.some(c => c <= 0)) {
            ZerowhaleTableLog.debug("The table reported an incomplete set of strips; using defaults.", counts);
            return false;
        }

        this.#pixelCounts = counts;
        ZerowhaleTableLog.debug("Strip lengths read from the table.", counts);
        return true;
    }

    static get pixelCounts() {
        return this.#pixelCounts ?? DEFAULT_PIXEL_COUNTS;
    }

    static getPixelCount(position) {
        return this.pixelCounts[position] ?? 0;
    }

    /** Total LEDs around the table. */
    static get totalPixels() {
        return this.pixelCounts.reduce((sum, count) => sum + count, 0);
    }

    /** How many LEDs lie between the start of the ring and the start of this strip. */
    static getOffset(position) {
        let offset = 0;
        for (let i = 0; i < position; i++) {
            offset += this.getPixelCount(i);
        }
        return offset;
    }

    static isReversed(position) {
        return ZerowhaleTableSettings.reversedPositions.includes(position);
    }

    /**
     * The wave parameters which make this strip carry its own slice of a single wave going all
     * the way around the table once every `periodFrames`.
     *
     * The server computes sin(angleMultiplier * tau * (i/length + frame/loopDuration) + tau * phase).
     * For that to equal the ring's wave sin(tau * ((offset + i)/total + frame/period)):
     * angleMultiplier is length/total, loopDuration is period*length/total, and phase is
     * offset/total. loopDuration is fractional on purpose; rounding it to whole frames gives
     * each strip a slightly different rate and they drift apart within a minute.
     */
    static getWaveParameters(position, periodFrames) {
        const length = this.getPixelCount(position);
        const total = this.totalPixels;
        if (length <= 0 || total <= 0) {
            return null;
        }

        const share = length / total;
        return {
            angleMultiplier: share,
            loopDuration: periodFrames * share,
            phase: this.getOffset(position) / total,
            reverse: this.isReversed(position)
        };
    }

    /** Wave parameters for every position, in device index order. */
    static getWaveParametersForAll(periodFrames) {
        const waves = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            waves.push(this.getWaveParameters(i, periodFrames));
        }
        return waves;
    }

    /** Forgets the cached lengths, so the next load reads them again. */
    static invalidate() {
        this.#pixelCounts = null;
    }
}
