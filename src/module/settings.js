import { MODULE_NAME, TABLE_POSITIONS } from "./const.js"

export const SETTING_TABLE_ENABLED = "zwtable-enabled";
export const SETTING_BASE_URL = "zwtable-base-url";
export const SETTING_DEBUG_LOGGING = "zwtable-debug-logging";
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

        for (let i = 0; i < TABLE_POSITIONS; i++) {
            game.settings.register(MODULE_NAME, SETTING_TABLE_POSITIONS[i], {
                name: `Player at Table Position ${i}`,
                hint: `The player who is sitting at table position ${i}.`,
                scope: "world",
                config: true,
                type: String,
                choices: this.getPlayerChoices(),
                default: ""
            })
        }
    }

    static get isTableEnabled() {
        return game.settings.get(MODULE_NAME, SETTING_TABLE_ENABLED) === true;
    }

    static get isDebugLoggingEnabled() {
        return game.settings.get(MODULE_NAME, SETTING_DEBUG_LOGGING) === true;
    }

    static get baseUrl() {
        return game.settings.get(MODULE_NAME, SETTING_BASE_URL) || "";
    }

    static getPlayerChoices() {
        let choices = Object.fromEntries(game.users.map(u => [u.id, u.name]));
        choices[""] = "-- none --";
        return choices;
    }

    static getConfiguredPlayerIds() {
        let ids = [];
        for (let i = 0; i < TABLE_POSITIONS; i++) {
            let id = game.settings.get(MODULE_NAME, SETTING_TABLE_POSITIONS[i]);
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
            let playerAtPosition = game.settings.get(MODULE_NAME, SETTING_TABLE_POSITIONS[i]);
            if (playerAtPosition === id) {
                return i;
            }
        }
        return -1;
    }
}
