import { MODULE_NAME, TABLE_POSITIONS } from "./const.js"

export const SETTING_TABLE_ENABLED = "zwtable-enabled";
export const SETTING_BASE_URL = "zwtable-base-url";
export const SETTING_DEBUG_LOGGING = "zwtable-debug-logging";
export const SETTING_IDLE_BRIGHTNESS = "zwtable-idle-brightness";
export const SETTING_TURN_TIMER_SECONDS = "zwtable-turn-timer-seconds";
export const SETTING_TABLE_POSITION_0 = "zwtable-pos-0";
export const SETTING_TABLE_POSITION_1 = "zwtable-pos-1";
export const SETTING_TABLE_POSITION_2 = "zwtable-pos-2";
export const SETTING_TABLE_POSITION_3 = "zwtable-pos-3";
export const SETTING_TABLE_POSITION_4 = "zwtable-pos-4";
export const SETTING_TABLE_POSITION_5 = "zwtable-pos-5";
export const SETTING_TABLE_POSITIONS = [
    SETTING_TABLE_POSITION_0,
    SETTING_TABLE_POSITION_1,
    SETTING_TABLE_POSITION_2,
    SETTING_TABLE_POSITION_3,
    SETTING_TABLE_POSITION_4,
    SETTING_TABLE_POSITION_5
];

/**
 * Effects which can be switched off individually. The last two are off by default: both add
 * light to the table often enough to be a distraction rather than information.
 */
export const EFFECTS = [
    { id: "damage",        name: "Damage and Healing",   hint: "Flash a seat when its character takes damage or is healed, scaled by how much of their health it was.", default: true },
    { id: "criticals",     name: "Criticals and Fumbles", hint: "Flash gold on a natural 20 and dark red on a natural 1.", default: true },
    { id: "concentration", name: "Concentration",         hint: "Pulse the end of a seat's strip while its character is concentrating on a spell.", default: true },
    { id: "deathSaves",    name: "Death Saves",           hint: "Throb red at zero hit points, and show death save successes and failures at either end of the strip.", default: true },
    { id: "upNext",        name: "Up Next",               hint: "Light the seat whose turn is next at part brightness, so they can get ready.", default: true },
    { id: "rest",          name: "Rests",                 hint: "Send a wave of warm light around the table when the party finishes a rest.", default: true },
    { id: "scenes",        name: "Scene Lighting",        hint: "Outside combat, run a stored table scene chosen by the active Foundry scene.", default: true },
    { id: "targeting",     name: "Targeting",             hint: "Briefly flash a seat when its character is targeted. Noisy at a busy table.", default: false }
];

export class ZerowhaleTableSettings {
    static registerSettings() {
        game.settings.register(MODULE_NAME, SETTING_TABLE_ENABLED, {
            name: "Table Enabled",
            hint: "Is the table integration enabled?",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        })

        game.settings.register(MODULE_NAME, SETTING_BASE_URL, {
            name: "Table API Base URL",
            hint: "The base URL for Zerowhale table API calls. Only the client which talks to the table needs to be able to reach this address.",
            scope: "world",
            config: true,
            type: String,
            default: ""
        });

        game.settings.register(MODULE_NAME, SETTING_DEBUG_LOGGING, {
            name: "Debug Logging",
            hint: "Write table commands and relayed events to this client's browser console.",
            scope: "client",
            config: true,
            type: Boolean,
            default: false
        });

        game.settings.register(MODULE_NAME, SETTING_IDLE_BRIGHTNESS, {
            name: "Idle Seat Brightness",
            hint: "How brightly to light seats whose turn it is not, as a percentage. At 0 only the active combatant is lit, which is how the table behaved before.",
            scope: "world",
            config: true,
            type: Number,
            range: { min: 0, max: 100, step: 5 },
            default: 20,
            onChange: () => ZerowhaleTableSettings.onDisplayChanged()
        });

        game.settings.register(MODULE_NAME, SETTING_TURN_TIMER_SECONDS, {
            name: "Turn Timer (seconds)",
            hint: "Pulse amber over the active seat once a turn has run this long. 0 turns the timer off.",
            scope: "world",
            config: true,
            type: Number,
            range: { min: 0, max: 300, step: 15 },
            default: 0
        });

        for (const effect of EFFECTS) {
            game.settings.register(MODULE_NAME, effectSettingKey(effect.id), {
                name: effect.name,
                hint: effect.hint,
                scope: "world",
                config: true,
                type: Boolean,
                default: effect.default,
                onChange: () => ZerowhaleTableSettings.onDisplayChanged()
            });
        }

        for (let i = 0; i < TABLE_POSITIONS; i++) {
            game.settings.register(MODULE_NAME, SETTING_TABLE_POSITIONS[i], {
                name: `Player at Table Position ${i}`,
                hint: `The player who is sitting at table position ${i}.`,
                scope: "world",
                config: true,
                type: String,
                choices: this.getPlayerChoices(),
                default: "",
                onChange: () => ZerowhaleTableSettings.onDisplayChanged()
            })
        }
    }

    /**
     * Called when a setting which changes what the table should be showing is edited. Assigned
     * by the module at startup rather than imported, to keep this module free of dependencies.
     */
    static onDisplayChanged = () => {};

    static get isTableEnabled() {
        return game.settings.get(MODULE_NAME, SETTING_TABLE_ENABLED) === true;
    }

    static get isDebugLoggingEnabled() {
        return game.settings.get(MODULE_NAME, SETTING_DEBUG_LOGGING) === true;
    }

    static get baseUrl() {
        return game.settings.get(MODULE_NAME, SETTING_BASE_URL) || "";
    }

    /** Idle seat brightness as a fraction of full. */
    static get idleBrightness() {
        const percent = Number(game.settings.get(MODULE_NAME, SETTING_IDLE_BRIGHTNESS));
        if (!Number.isFinite(percent)) {
            return 0.2;
        }
        return Math.max(0, Math.min(100, percent)) / 100;
    }

    static get turnTimerSeconds() {
        const value = Number(game.settings.get(MODULE_NAME, SETTING_TURN_TIMER_SECONDS));
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    static isEffectEnabled(effectId) {
        try {
            return game.settings.get(MODULE_NAME, effectSettingKey(effectId)) === true;
        } catch {
            // Not registered yet, or an unknown effect id.
            return false;
        }
    }

    static getPlayerChoices() {
        let choices = Object.fromEntries(game.users.map(u => [u.id, u.name]));
        choices[""] = "-- none --";
        return choices;
    }

    static getPlayerIdAtPosition(position) {
        if (position < 0 || position >= TABLE_POSITIONS) {
            return "";
        }
        return game.settings.get(MODULE_NAME, SETTING_TABLE_POSITIONS[position]) || "";
    }

    static getConfiguredPlayerIds() {
        let ids = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            let id = this.getPlayerIdAtPosition(i);
            if (id) {
                ids.push(id);
            }
        }
        return ids;
    }

    static getConfiguredPlayers() {
        let configured = new Set(this.getConfiguredPlayerIds());
        return game.users.filter(u => configured.has(u.id));
    }

    static getConfiguredOwnerOfActor(actor) {
        if (!actor) {
            return null;
        }
        let players = this.getConfiguredPlayers();
        let owner =
            players.find(u => !u.isGM && actor.testUserPermission(u, "OWNER")) ||
            players.find(u =>  u.isGM && actor.testUserPermission(u, "OWNER"));
        return owner ?? null;
    }

    /**
     * Gets the CSS color string for the specified user. User#color is a Color instance in
     * modern Foundry versions, but fall back to whatever we were given if that ever changes.
     */
    static getUserColorCss(user) {
        return user?.color?.css ?? (typeof user?.color === "string" ? user.color : "#ffffff");
    }

    static getTablePositionForPlayerId(id) {
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            if (this.getPlayerIdAtPosition(i) === id) {
                return i;
            }
        }
        return -1;
    }
}

function effectSettingKey(effectId) {
    return `zwtable-effect-${effectId}`;
}
