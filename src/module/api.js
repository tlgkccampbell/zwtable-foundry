import { MODULE_NAME } from "./const.js";
import { SETTING_BASE_URL, SETTING_TABLE_ENABLED } from "./settings.js";

export class ZerowhaleTableApi {
    static async executeCommands(commands) {
        let enabled = game.settings.get(MODULE_NAME, SETTING_TABLE_ENABLED);
        if (enabled) {
            let baseurl = game.settings.get(MODULE_NAME, SETTING_BASE_URL);
            if (baseurl) {
                await fetch(new URL("/api/lights/execute/commands", baseurl).href, {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ "commands": commands })
                })
            }
        }
    }
}