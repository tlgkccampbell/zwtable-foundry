import { TABLE_POSITIONS } from "./const.js";
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
                    "name": "baseColor",
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
                    "name": "baseColor",
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
                        "name": "baseColor",
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
                        "name": "baseColor",
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
                        "name": "baseColor",
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