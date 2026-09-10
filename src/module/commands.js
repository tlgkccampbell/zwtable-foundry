import { ACCENT_PIXEL_COUNT, SLOT_ACCENT, SLOT_BASE, TABLE_POSITIONS } from "./const.js";
import { ZerowhaleTableSettings } from "./settings.js";

export class ZerowhaleTableCommands {
    static reset() {
        let commands = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            commands.push({
                "deviceIndex": i,
                "commandAction": "clear"
            })
        }
        return commands;
    }

    static initiative() {
        let commands = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            commands.push({
                "deviceIndex": i,
                "commandAction": "set",
                "commandType": "SineWave",
                "commandParameters": {
                    "name": SLOT_BASE,
                    "colors": [{"color": "#FF0000"}],
                    "amplitudeMultiplier": 1.0,
                    "angleMultiplier": 1.0,
                    "loopDuration": 30
                }
            })
        }
        return commands;
    }

    static setPositionColor(position, color) {
        return [
            {
                "deviceIndex": position,
                "commandAction": "set",
                "commandType": "SetPixels",
                "commandParameters": {
                    "name": SLOT_BASE,
                    "colors": [{"color": color}]
                }
            }
        ];
    }

    static setPlayerColor(id, color) {
        let position = ZerowhaleTableSettings.getTablePositionForPlayerId(id);
        if (position >= 0) {
            return [
                {
                    "deviceIndex": position,
                    "commandAction": "replaceOrSet",
                    "commandType": "SetPixels",
                    "commandParameters": {
                        "name": SLOT_BASE,
                        "colors": [{"color": color}]
                    }
                }
            ];
        }
        return [];
    }

    static setPlayerColorBloodied(id, color) {
        let position = ZerowhaleTableSettings.getTablePositionForPlayerId(id);
        if (position >= 0) {
            return [
                {
                    "deviceIndex": position,
                    "commandAction": "replaceOrSet",
                    "commandType": "SetPixels",
                    "commandParameters": {
                        "name": SLOT_BASE,
                        "colors": [
                            {"color":"#ff0000"},
                            {"color": color}
                        ]
                    }
                }
            ];
        }
        return [];
    }

    static setPlayerRainbowWave(id) {
        let position = ZerowhaleTableSettings.getTablePositionForPlayerId(id);
        if (position >= 0) {
            return [
                {
                    "deviceIndex": position,
                    "commandAction": "replaceOrSet",
                    "commandType": "RandomColors",
                    "commandParameters": {
                        "name": SLOT_BASE,
                        "colors": [
                            {"color": "#ff0000"},
                            {"color": "#ff8000"},
                            {"color": "#ffff00"},
                            {"color": "#00ff00"},
                            {"color": "#00ff80"},
                            {"color": "#00ffff"},
                            {"color": "#0000ff"},
                            {"color": "#8000ff"},
                        ],
                        "speed": 8
                    }
                }
            ];
        }
        return [];
    }

    /**
     * Lights a short run of pixels at the end of a player's position, as a secondary indicator
     * which coexists with whatever the base slot is showing. Requires a table server that
     * supports pixel ranges; older servers render this across the whole strip instead.
     */
    static setPlayerAccent(id, color, pixelCount = ACCENT_PIXEL_COUNT) {
        let position = ZerowhaleTableSettings.getTablePositionForPlayerId(id);
        if (position >= 0) {
            return [
                {
                    "deviceIndex": position,
                    "commandAction": "replaceOrPush",
                    "commandType": "SetPixels",
                    "commandParameters": {
                        "name": SLOT_ACCENT,
                        "colors": [{"color": color}],
                        "startPixel": -pixelCount,
                        "pixelCount": pixelCount
                    }
                }
            ];
        }
        return [];
    }

    static flashPlayer(id, color) {
        let position = ZerowhaleTableSettings.getTablePositionForPlayerId(id);
        if (position >= 0) {
            return [
                {
                    "deviceIndex": position,
                    "commandAction": "push",
                    "commandType": "Blink",
                    "commandParameters": {
                        "colors": [{"color": color}],
                        "timeOn": 5,
                        "timeOff": 5,
                        "expirationTime": 30
                    }
                }
            ];
        }
        return [];       
    }
}