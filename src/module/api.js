import {
    API_KEY_HEADER,
    COMMAND_ACTIONS,
    MAX_COMMANDS_PER_BATCH,
    REQUEST_TIMEOUT_MS,
    SOCKET_MESSAGE_EXECUTE_COMMANDS,
    SOCKET_MESSAGE_EXECUTE_SCENE,
    SOCKET_NAME,
    TABLE_POSITIONS
} from "./const.js";
import { ZerowhaleTableLog } from "./log.js";
import { diagnoseAddressSpace } from "./network.js";
import { ZerowhaleTableSettings } from "./settings.js";

/** How often, at most, to warn about an unreachable table server. */
const WARN_INTERVAL_MS = 30000;

export class ZerowhaleTableApi {
    static #lastWarningTime = 0;

    /**
     * The single client which is responsible for talking to the table. Every other client
     * relays its commands here over the module socket, so the table only ever receives one
     * copy of each command and only this client needs network access to the table server.
     */
    static get responsibleUser() {
        return game.users?.activeGM ?? null;
    }

    /** Whether this client is the one responsible for talking to the table. */
    static get isResponsibleUser() {
        const responsible = this.responsibleUser;
        return !!responsible && responsible.id === game.user?.id;
    }

    /**
     * Listens for commands relayed by other clients. Registered on every client, but only the
     * responsible client acts on what it receives.
     */
    static registerSocketListener() {
        game.socket.on(SOCKET_NAME, async (payload) => {
            if (!this.isResponsibleUser) {
                return;
            }

            const from = game.users.get(payload?.userId)?.name ?? payload?.userId;

            if (payload?.type === SOCKET_MESSAGE_EXECUTE_COMMANDS) {
                const commands = this.#sanitizeCommands(payload.commands);
                if (!commands) {
                    ZerowhaleTableLog.warn("Discarded a malformed relayed command batch.", payload);
                    return;
                }
                ZerowhaleTableLog.debug(`Executing ${commands.length} command(s) relayed by ${from}.`);
                await this.#postCommands(commands);
                return;
            }

            if (payload?.type === SOCKET_MESSAGE_EXECUTE_SCENE) {
                if (typeof payload.name !== "string" || !payload.name || payload.name.length > 64) {
                    ZerowhaleTableLog.warn("Discarded a malformed relayed scene.", payload);
                    return;
                }
                ZerowhaleTableLog.debug(`Executing scene "${payload.name}" relayed by ${from}.`);
                await this.#postScene(payload.name);
            }
        });
    }

    /**
     * Executes commands against the table. If this client is not the responsible one, the
     * commands are relayed to the client that is.
     */
    static async executeCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0) {
            return;
        }
        if (!ZerowhaleTableSettings.isTableEnabled) {
            ZerowhaleTableLog.debug("Table integration is disabled; discarding commands.", commands);
            return;
        }

        if (this.isResponsibleUser) {
            await this.#postCommands(commands);
            return;
        }

        const responsible = this.responsibleUser;
        if (!responsible) {
            ZerowhaleTableLog.debug("No active GM is connected; the table cannot be updated.", commands);
            return;
        }

        ZerowhaleTableLog.debug(`Relaying ${commands.length} command(s) to ${responsible.name}.`, commands);
        game.socket.emit(SOCKET_NAME, {
            type: SOCKET_MESSAGE_EXECUTE_COMMANDS,
            userId: game.user?.id,
            commands: commands
        });
    }

    /**
     * Runs a scene stored on the table server by name. Scenes live in the server's database
     * rather than being sent as commands, so this is one request no matter how elaborate.
     */
    static async executeScene(name) {
        if (typeof name !== "string" || !name) {
            return;
        }
        if (!ZerowhaleTableSettings.isTableEnabled) {
            ZerowhaleTableLog.debug(`Table integration is disabled; not running scene "${name}".`);
            return;
        }

        if (this.isResponsibleUser) {
            await this.#postScene(name);
            return;
        }

        const responsible = this.responsibleUser;
        if (!responsible) {
            ZerowhaleTableLog.debug(`No active GM is connected; cannot run scene "${name}".`);
            return;
        }

        ZerowhaleTableLog.debug(`Relaying scene "${name}" to ${responsible.name}.`);
        game.socket.emit(SOCKET_NAME, {
            type: SOCKET_MESSAGE_EXECUTE_SCENE,
            userId: game.user?.id,
            name: name
        });
    }

    /** Queries the table server for the status of each light strip controller. */
    static async getStatus() {
        const url = this.#buildUrl("/api/lights");
        if (!url) {
            return null;
        }
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.#headers(),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
            if (!response.ok) {
                ZerowhaleTableLog.warn(this.#describeResponse(response));
                return null;
            }
            return await response.json();
        } catch (err) {
            ZerowhaleTableLog.warn(...this.#unreachable(url, err));
            return null;
        }
    }

    static #buildUrl(path) {
        const baseurl = ZerowhaleTableSettings.baseUrl;
        if (!baseurl) {
            ZerowhaleTableLog.debug("No table API base URL is configured.");
            return null;
        }
        try {
            return new URL(path, baseurl).href;
        } catch (err) {
            ZerowhaleTableLog.warn(`"${baseurl}" is not a valid table API base URL.`, err);
            return null;
        }
    }

    static async #postScene(name) {
        if (!ZerowhaleTableSettings.isTableEnabled) {
            return;
        }
        const url = this.#buildUrl("/api/lights/execute/scene");
        if (!url) {
            return;
        }

        ZerowhaleTableLog.debug(`POST ${url}`, name);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: this.#headers({ "Content-Type": "application/json" }),
                body: JSON.stringify({ "name": name }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
            if (response.status === 404) {
                // A Foundry scene naming a table scene which has not been created is a
                // configuration mistake, not a fault, so say so plainly and once.
                this.#warnThrottled(`The table server has no scene named "${name}".`);
            } else if (!response.ok) {
                this.#warnThrottled(this.#describeResponse(response));
            }
        } catch (err) {
            this.#warnThrottled(...this.#unreachable(url, err));
        }
    }

    static async #postCommands(commands) {
        if (!ZerowhaleTableSettings.isTableEnabled) {
            return;
        }
        const url = this.#buildUrl("/api/lights/execute/commands");
        if (!url) {
            return;
        }

        ZerowhaleTableLog.debug(`POST ${url}`, commands);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: this.#headers({ "Content-Type": "application/json" }),
                body: JSON.stringify({ "commands": commands }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
            if (!response.ok) {
                this.#warnThrottled(this.#describeResponse(response));
            }
        } catch (err) {
            this.#warnThrottled(...this.#unreachable(url, err));
        }
    }

    /**
     * The headers every request carries. The shared secret is added only when one is
     * configured, because a table on a private network is usually given none -- and because
     * sending the header at all makes the request one the browser must preflight.
     */
    static #headers(extra) {
        const headers = { "Accept": "application/json", ...extra };
        const apiKey = ZerowhaleTableSettings.apiKey;
        if (apiKey) {
            headers[API_KEY_HEADER] = apiKey;
        }
        return headers;
    }

    /** Explains an unsuccessful response, naming the causes which have a specific remedy. */
    static #describeResponse(response) {
        if (response.status === 401) {
            return `The table server rejected this client's API key. Set "Table API Key" in the ` +
                `module settings to the secret the server was given as ZWTABLE_API_KEY.`;
        }
        return `Table server responded with ${response.status} ${response.statusText}.`;
    }

    /**
     * Warns once at startup when the browser will not let this client reach the table at all.
     * That refusal happens before any request is sent and is reported as a CORS error, so it
     * is worth saying plainly rather than leaving a GM to conclude the table is broken.
     */
    static checkAddressSpace() {
        const url = this.#buildUrl("/api/lights");
        const diagnosis = url ? diagnoseAddressSpace(url) : null;
        if (!diagnosis) {
            return;
        }
        ZerowhaleTableLog.warn(diagnosis);
        globalThis.ui?.notifications?.warn?.(
            "Zerowhale table: this browser is not allowed to reach the table server. See the console.",
            { permanent: true });
    }

    /**
     * Describes a request that failed, saying why the browser refused it when that is knowable
     * and blaming nothing when it is not.
     */
    static #unreachable(url, err) {
        const message = `Could not reach the table server at ${url}.`;
        const diagnosis = diagnoseAddressSpace(url);
        return diagnosis ? [`${message} ${diagnosis}`, err] : [message, err];
    }

    /**
     * Warns at most once per interval. A table that is switched off would otherwise flood the
     * console with one failure per turn.
     */
    static #warnThrottled(...args) {
        const now = Date.now();
        if (now - this.#lastWarningTime < WARN_INTERVAL_MS) {
            ZerowhaleTableLog.debug(...args);
            return;
        }
        this.#lastWarningTime = now;
        ZerowhaleTableLog.warn(...args);
    }

    /** Validates a command batch that arrived over the socket from another client. */
    static #sanitizeCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0 || commands.length > MAX_COMMANDS_PER_BATCH) {
            return null;
        }
        for (const command of commands) {
            if (!command || typeof command !== "object") {
                return null;
            }
            if (!Number.isInteger(command.deviceIndex) || command.deviceIndex < 0 || command.deviceIndex >= TABLE_POSITIONS) {
                return null;
            }
            if (!COMMAND_ACTIONS.includes(command.commandAction)) {
                return null;
            }
            const parameters = command.commandParameters;
            if (parameters !== undefined && parameters !== null) {
                if (typeof parameters !== "object") {
                    return null;
                }
                for (const key of ["startPixel", "pixelCount", "expirationTime"]) {
                    if (parameters[key] !== undefined && !Number.isInteger(parameters[key])) {
                        return null;
                    }
                }
            }
        }
        return commands;
    }
}
