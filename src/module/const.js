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

/** Socket message which asks the responsible client to execute a stored scene. */
export const SOCKET_MESSAGE_EXECUTE_SCENE = "executeScene";

/**
 * Reserved command names. The table server matches these by name, so each names a slot which
 * persists across updates. See Documentation/command-stack.md in the table server repository.
 *
 * - base   spans the whole strip and carries the seat's resolved state.
 * - accent and pips are short ranges at either end, for a secondary indicator which has to
 *   coexist with the base.
 * - timer  is the overlay a turn that has run long puts up.
 *
 * Everything else is an anonymous push which always expires.
 */
export const SLOT_BASE = "base";
export const SLOT_ACCENT = "accent";
export const SLOT_PIPS = "pips";
export const SLOT_TIMER = "timer";

/** How many pixels at each end of a strip the accent and pip slots occupy. */
export const ACCENT_PIXEL_COUNT = 3;

/** Command actions which the table server understands. Used to validate relayed payloads. */
export const COMMAND_ACTIONS = [
    "clear",
    "set",
    "replaceOrSet",
    "push",
    "replaceOrPush",
    "pop",
    "remove"
];

/** The maximum number of commands accepted in a single relayed batch. */
export const MAX_COMMANDS_PER_BATCH = 64;

/** How long to wait for the table server before giving up on a request, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 5000;

/** The table server runs its animations at this rate, so durations are expressed in frames. */
export const FRAMES_PER_SECOND = 30;

/**
 * How prominent a seat is. A seat is at full brightness on its own turn, dimmer when its turn
 * is next, and dimmer still the rest of the time, so the table reads as a party status board
 * without losing track of whose turn it is.
 */
export const EMPHASIS_ACTIVE = "active";
export const EMPHASIS_NEXT = "next";
export const EMPHASIS_IDLE = "idle";

/** Brightness applied to a seat whose turn is next, as a fraction of full. */
export const NEXT_BRIGHTNESS = 0.45;

/** Colours used by effects which do not derive their colour from a player. */
export const COLOR_DAMAGE = "#ff0000";
export const COLOR_HEALING = "#00ff00";
export const COLOR_CRITICAL = "#ffd23f";
export const COLOR_FUMBLE = "#7a0b0b";
export const COLOR_DEATH_SAVE_SUCCESS = "#ffffff";
export const COLOR_DEATH_SAVE_FAILURE = "#ff2d2d";
export const COLOR_CONCENTRATION = "#00e5ff";
export const COLOR_DYING = "#ff0000";
export const COLOR_DEAD = "#2a2a2a";
export const COLOR_UNCONSCIOUS = "#9aa4b2";
export const COLOR_TIMER = "#f5a524";
export const COLOR_REST = "#ffb060";
export const COLOR_INITIATIVE = "#FF0000";
