export const MODULE_NAME = "zwtable-foundry";
export const MODULE_TITLE = "Zerowhale Table Integration";
export const TABLE_POSITIONS = 6;

/**
 * The socket namespace used to relay table commands between clients. Foundry only
 * provides this namespace because the manifest declares "socket": true.
 */
export const SOCKET_NAME = `module.${MODULE_NAME}`;

/** Socket message which asks the responsible client to execute a batch of commands. */
export const SOCKET_MESSAGE_EXECUTE_COMMANDS = "executeCommands";

/** Command actions which the table server understands. Used to validate relayed payloads. */
export const COMMAND_ACTIONS = [
    "clear",
    "set",
    "replaceOrSet",
    "push",
    "replaceOrPush",
    "pop"
];

/** The maximum number of commands accepted in a single relayed batch. */
export const MAX_COMMANDS_PER_BATCH = 64;

/** How long to wait for the table server before giving up on a request, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 5000;
