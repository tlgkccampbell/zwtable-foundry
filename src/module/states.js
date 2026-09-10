/**
 * The states a seat can be in, and how each is drawn.
 *
 * States are conditions of the character -- adjectives -- and they are mutually exclusive:
 * exactly one wins and becomes the seat's base layer. Ordering is significance, most
 * significant first, so adding a state is one entry and the precedence is the list itself
 * rather than the shape of an if/else chain.
 *
 * Things which happen to a character rather than conditions of it are events, and live in
 * effects.js.
 */
export const TABLE_STATES = [
    { id: "dead",          test: (actor) => hasStatus(actor, "dead") },
    { id: "dying",         test: (actor) => isDying(actor) },
    { id: "unconscious",   test: (actor) => hasStatus(actor, "unconscious") },
    { id: "charmed",       test: (actor) => hasStatus(actor, "charmed") },
    { id: "bloodied",      test: (actor) => hasStatus(actor, "bloodied") },
    { id: "normal",        test: () => true }
];

function hasStatus(actor, status) {
    return actor?.statuses?.has(status) === true;
}

/** Hit points, or null for an actor which does not track them the way dnd5e does. */
export function getHitPoints(actor) {
    const hp = actor?.system?.attributes?.hp;
    if (!hp || typeof hp.value !== "number") {
        return null;
    }
    return { value: hp.value, max: typeof hp.max === "number" ? hp.max : null };
}

/**
 * A character at zero hit points which is not already dead is making death saves. Checked
 * before "unconscious" because dnd5e applies that status too, and dying is the more useful
 * thing to show.
 */
export function isDying(actor) {
    if (hasStatus(actor, "dead")) {
        return false;
    }
    const hp = getHitPoints(actor);
    return hp !== null && hp.value <= 0;
}

/** Death save progress, or null if the actor does not track it. */
export function getDeathSaves(actor) {
    const death = actor?.system?.attributes?.death;
    if (!death) {
        return null;
    }
    return {
        success: Number(death.success) || 0,
        failure: Number(death.failure) || 0
    };
}

export function isConcentrating(actor) {
    return hasStatus(actor, "concentrating");
}

/** The id of the most significant state which applies to an actor. */
export function resolveState(actor) {
    for (const state of TABLE_STATES) {
        try {
            if (state.test(actor)) {
                return state.id;
            }
        } catch {
            // A state whose test throws should not stop the rest from being considered.
        }
    }
    return "normal";
}
