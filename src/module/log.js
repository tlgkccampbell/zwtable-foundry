import { MODULE_TITLE } from "./const.js";
import { ZerowhaleTableSettings } from "./settings.js";

/**
 * Console logging for the module. Debug output is opt-in per client so that a
 * misbehaving table can be diagnosed without spamming everybody's console.
 */
export class ZerowhaleTableLog {
    static debug(...args) {
        try {
            if (!ZerowhaleTableSettings.isDebugLoggingEnabled) {
                return;
            }
        } catch {
            // Settings are not registered yet; stay quiet.
            return;
        }
        console.debug(`${MODULE_TITLE} |`, ...args);
    }

    static warn(...args) {
        console.warn(`${MODULE_TITLE} |`, ...args);
    }

    static error(...args) {
        console.error(`${MODULE_TITLE} |`, ...args);
    }
}
