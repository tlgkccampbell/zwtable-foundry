import { MODULE_NAME, TABLE_POSITIONS } from "./const.js"

export const SETTING_TABLE_ENABLED = "zwtable-enabled";
export const SETTING_BASE_URL = "zwtable-base-url";
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
            hint: "The base URL for Zerowhale table API calls.",
            scope: "world",
            config: true,
            type: String
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

    static getPlayerChoices() {
        let choices = Object.fromEntries(game.users.map(u => [u._id, u.name]));
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
        return game.users.filter(u => configured.has(u._id));
    }

    static getConfiguredOwnerOfActor(actor) {
        let players = this.getConfiguredPlayers();
        let owner = 
            players.find(u => !u.isGM && actor.testUserPermission(u, "OWNER")) || 
            players.find(u =>  u.isGM && actor.testUserPermission(u, "OWNER"));
        return owner;
    }

    static getTableApiUrl(url) {
        let baseUrl = game.settings.get(MODULE_NAME, SETTING_BASE_URL);
        return new URL(baseUrl, url).href;
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