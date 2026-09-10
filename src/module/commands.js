import {
    ACCENT_PIXEL_COUNT,
    INITIATIVE_PERIOD_FRAMES,
    COLOR_CONCENTRATION,
    COLOR_CRITICAL,
    COLOR_DAMAGE,
    COLOR_DEAD,
    COLOR_DEATH_SAVE_FAILURE,
    COLOR_DEATH_SAVE_SUCCESS,
    COLOR_DYING,
    COLOR_FUMBLE,
    COLOR_HEALING,
    COLOR_INITIATIVE,
    COLOR_REST,
    COLOR_TIMER,
    COLOR_UNCONSCIOUS,
    FRAMES_PER_SECOND,
    SLOT_ACCENT,
    SLOT_BASE,
    SLOT_PIPS,
    SLOT_TIMER,
    TABLE_POSITIONS
} from "./const.js";
import { ZerowhaleTableColor } from "./color.js";

const seconds = (n) => Math.max(1, Math.round(n * FRAMES_PER_SECOND));

export class ZerowhaleTableCommands {
    // ---- Whole table ---------------------------------------------------------------------

    /** Clears every position. */
    static reset() {
        const commands = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            commands.push({ "deviceIndex": i, "commandAction": "clear" });
        }
        return commands;
    }

    /**
     * The red wave which runs while initiative is being rolled.
     *
     * Given the table's geometry, the six strips carry consecutive slices of a single wave which
     * travels once around the table. Without it each strip runs its own copy of the same wave,
     * which reflects wherever two strips meet with their first LEDs adjacent.
     */
    static initiative(waves = null) {
        const commands = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            const wave = waves?.[i];
            commands.push({
                "deviceIndex": i,
                "commandAction": "set",
                "commandType": "SineWave",
                "commandParameters": {
                    "name": SLOT_BASE,
                    "colors": [{ "color": COLOR_INITIATIVE }],
                    "amplitudeMultiplier": 1.0,
                    "angleMultiplier": wave ? wave.angleMultiplier : 1.0,
                    "loopDuration": wave ? wave.loopDuration : INITIATIVE_PERIOD_FRAMES / 3,
                    "phase": wave ? wave.phase : 0,
                    "reverse": wave ? wave.reverse : false
                }
            });
        }
        return commands;
    }

    /**
     * Lights the first three LEDs of every strip white over a dim base, so that which physical
     * end of each strip its first LED sits at can simply be read off the table. That is what the
     * reversed positions setting needs to know.
     */
    static wiringDiagnostic() {
        const commands = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            commands.push({
                "deviceIndex": i,
                "commandAction": "set",
                "commandType": "SetPixels",
                "commandParameters": { "name": SLOT_BASE, "colors": [{ "color": "#101828" }] }
            });
            commands.push({
                "deviceIndex": i,
                "commandAction": "replaceOrPush",
                "commandType": "SetPixels",
                "commandParameters": {
                    "name": SLOT_PIPS,
                    "startPixel": 0,
                    "pixelCount": 3,
                    "colors": [{ "color": "#ffffff" }]
                }
            });
        }
        return commands;
    }

    /**
     * A wave of warm light travelling around the table, one seat after another. Used when the
     * party finishes a rest. Pushed on top and expiring, so it reveals whatever was underneath.
     */
    static restSweep() {
        const commands = [];
        const framesPerPixel = 4;
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            commands.push({
                "deviceIndex": i,
                "commandAction": "push",
                "commandType": "DotCrawl",
                "commandParameters": {
                    "colors": [
                        { "color": ZerowhaleTableColor.scale(COLOR_REST, 0.35) },
                        { "color": COLOR_REST },
                        { "color": "#ffffff" },
                        { "color": COLOR_REST },
                        { "color": ZerowhaleTableColor.scale(COLOR_REST, 0.35) }
                    ],
                    "delayStart": i * 6,
                    "delayEnd": (TABLE_POSITIONS - i) * 6,
                    "framesPerPixel": framesPerPixel,
                    "expirationTime": seconds(6)
                }
            });
        }
        return commands;
    }

    // ---- A seat's base layer -------------------------------------------------------------

    /**
     * Draws a resolved state across a whole strip. Brightness is applied here rather than by
     * the table, which has no brightness control of its own.
     */
    static state(position, stateId, playerColor, brightness) {
        if (position < 0) {
            return [];
        }

        const dim = (color) => ZerowhaleTableColor.scale(color, brightness);
        const set = (commandType, parameters) => [{
            "deviceIndex": position,
            "commandAction": "replaceOrSet",
            "commandType": commandType,
            "commandParameters": Object.assign({ "name": SLOT_BASE }, parameters)
        }];

        switch (stateId) {
            case "dead":
                return set("SetPixels", { "colors": [{ "color": dim(COLOR_DEAD) }] });

            case "dying":
                return set("Throb", {
                    "colors": [{ "color": dim(COLOR_DYING) }],
                    "loopDuration": 50
                });

            case "unconscious":
                return set("SetPixels", { "colors": [{ "color": dim(COLOR_UNCONSCIOUS) }] });

            case "charmed":
                return set("RandomColors", {
                    "colors": ZerowhaleTableColor.scaleAll([
                        "#ff0000", "#ff8000", "#ffff00", "#00ff00",
                        "#00ff80", "#00ffff", "#0000ff", "#8000ff"
                    ], brightness).map(color => ({ "color": color })),
                    "speed": 8
                });

            case "bloodied":
                return set("SetPixels", {
                    "colors": [
                        { "color": dim(COLOR_DAMAGE) },
                        { "color": dim(playerColor) }
                    ]
                });

            default:
                return set("SetPixels", { "colors": [{ "color": dim(playerColor) }] });
        }
    }

    // ---- Overlays ------------------------------------------------------------------------

    /** A short run of pixels at the far end of a strip, sitting above the base. */
    static accent(position, commandType, parameters) {
        if (position < 0) {
            return [];
        }
        return [{
            "deviceIndex": position,
            "commandAction": "replaceOrPush",
            "commandType": commandType,
            "commandParameters": Object.assign({
                "name": SLOT_ACCENT,
                "startPixel": -ACCENT_PIXEL_COUNT,
                "pixelCount": ACCENT_PIXEL_COUNT
            }, parameters)
        }];
    }

    /** A short run of pixels at the near end of a strip, sitting above the base. */
    static pips(position, commandType, parameters) {
        if (position < 0) {
            return [];
        }
        return [{
            "deviceIndex": position,
            "commandAction": "replaceOrPush",
            "commandType": commandType,
            "commandParameters": Object.assign({
                "name": SLOT_PIPS,
                "startPixel": 0,
                "pixelCount": ACCENT_PIXEL_COUNT
            }, parameters)
        }];
    }

    /** Retires a named slot. Cheap, and does nothing when the slot is not in use. */
    static clearSlot(position, slot) {
        if (position < 0) {
            return [];
        }
        return [{
            "deviceIndex": position,
            "commandAction": "remove",
            "commandParameters": { "name": slot }
        }];
    }

    /** Pulses at the far end of a seat's strip while its character holds concentration. */
    static concentration(position, brightness) {
        return this.accent(position, "Throb", {
            "colors": [{ "color": ZerowhaleTableColor.scale(COLOR_CONCENTRATION, brightness) }],
            "loopDuration": 70
        });
    }

    /** Lights one pixel per death save success at the near end, and per failure at the far end. */
    static deathSaves(position, successes, failures, brightness) {
        const litRun = (count, color) => {
            const colors = [];
            for (let i = 0; i < ACCENT_PIXEL_COUNT; i++) {
                colors.push({
                    "color": i < count ? ZerowhaleTableColor.scale(color, brightness) : "#000000"
                });
            }
            return colors;
        };

        const commands = [];
        if (successes > 0) {
            commands.push(...this.pips(position, "SetPixels",
                { "colors": litRun(successes, COLOR_HEALING) }));
        } else {
            commands.push(...this.clearSlot(position, SLOT_PIPS));
        }

        if (failures > 0) {
            commands.push(...this.accent(position, "SetPixels",
                { "colors": litRun(failures, COLOR_DEATH_SAVE_FAILURE).reverse() }));
        } else {
            commands.push(...this.clearSlot(position, SLOT_ACCENT));
        }
        return commands;
    }

    /** A slow amber pulse over a seat whose turn has run long. */
    static turnTimer(position) {
        if (position < 0) {
            return [];
        }
        return [{
            "deviceIndex": position,
            "commandAction": "replaceOrPush",
            "commandType": "Throb",
            "commandParameters": {
                "name": SLOT_TIMER,
                "colors": [{ "color": COLOR_TIMER }],
                "loopDuration": 40
            }
        }];
    }

    static clearTurnTimer(position) {
        return this.clearSlot(position, SLOT_TIMER);
    }

    // ---- Events --------------------------------------------------------------------------

    /**
     * A transient blink above everything else. Always expires, which is what keeps the command
     * stack from growing: an anonymous command can never be removed by name.
     */
    static event(position, color, { blinks = 3, frameLength = 5 } = {}) {
        if (position < 0) {
            return [];
        }
        return [{
            "deviceIndex": position,
            "commandAction": "push",
            "commandType": "Blink",
            "commandParameters": {
                "colors": [{ "color": color }],
                "timeOn": frameLength,
                "timeOff": frameLength,
                "expirationTime": Math.max(1, Math.round(blinks * frameLength * 2))
            }
        }];
    }

    /**
     * Damage and healing, with the flash scaled by how much of the character's health it was.
     * A three point scratch should not look like a forty point critical.
     */
    static damage(position, amount, maxHitPoints) {
        const magnitude = (maxHitPoints > 0) ? Math.min(1, Math.abs(amount) / maxHitPoints) : 0.25;
        const healing = amount < 0;
        return this.event(position, healing ? COLOR_HEALING : COLOR_DAMAGE, {
            blinks: Math.max(1, Math.round(1 + (magnitude * 6))),
            frameLength: healing ? 6 : Math.max(3, Math.round(7 - (magnitude * 4)))
        });
    }

    static critical(position) {
        return this.event(position, COLOR_CRITICAL, { blinks: 6, frameLength: 3 });
    }

    static fumble(position) {
        return this.event(position, COLOR_FUMBLE, { blinks: 2, frameLength: 12 });
    }

    static deathSaveSuccess(position) {
        return this.event(position, COLOR_DEATH_SAVE_SUCCESS, { blinks: 2, frameLength: 6 });
    }

    static deathSaveFailure(position) {
        return this.event(position, COLOR_DEATH_SAVE_FAILURE, { blinks: 3, frameLength: 8 });
    }

    static targeted(position) {
        return this.event(position, "#ffffff", { blinks: 1, frameLength: 4 });
    }

    // ---- Diagnostics ---------------------------------------------------------------------

    static setPositionColor(position, color) {
        return [{
            "deviceIndex": position,
            "commandAction": "set",
            "commandType": "SetPixels",
            "commandParameters": { "name": SLOT_BASE, "colors": [{ "color": color }] }
        }];
    }
}
