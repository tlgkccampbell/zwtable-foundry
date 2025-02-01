import { MODULE_NAME } from "./const.js";
import { SETTING_BASE_URL } from "./settings.js";

export class ZerowhaleTableApi {
    static async executeCommands(commands) {
        let baseurl = game.settings.get(MODULE_NAME, SETTING_BASE_URL);
        await fetch(baseurl + "api/lights/execute/commands", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ "commands": commands })
        })
    }
}