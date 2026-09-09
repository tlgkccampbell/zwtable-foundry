import { ZerowhaleTableApi } from "./api.js";
import { ZerowhaleTableCommands } from "./commands.js";
import { ZerowhaleTableSettings } from "./settings.js";

/** How long to coalesce rapid state changes before refreshing the table, in milliseconds. */
const REFRESH_DEBOUNCE_MS = 100;

export class ZerowhaleTableCombat {
    static #debouncedRefresh = null;

    /**
     * Resolves the actor which a combatant represents. Combatant#actor returns the token's
     * actor, which for an unlinked token is a synthetic actor distinct from the world actor
     * that game.actors.get(combatant.actorId) returns. Comparing against the wrong one is why
     * status changes used to be missed for unlinked tokens.
     */
    static getCombatantActor(combatant) {
        return combatant?.actor ?? null;
    }

    static getCurrentCombatant() {
        const combat = game.combat;
        const combatantId = combat?.current?.combatantId;
        if (!combat || !combatantId) {
            return null;
        }
        return combat.combatants.get(combatantId) ?? null;
    }

    static getCurrentCombatantActor() {
        return this.getCombatantActor(this.getCurrentCombatant());
    }

    /**
     * Resolves the actor which an embedded document ultimately belongs to. An active effect
     * may live directly on an actor, or on an item which itself belongs to one.
     */
    static getOwningActor(document) {
        let parent = document?.parent;
        while (parent) {
            if (parent.documentName === "Actor") {
                return parent;
            }
            parent = parent.parent;
        }
        return null;
    }

    static isCurrentCombatantActor(actor) {
        const current = this.getCurrentCombatantActor();
        return !!actor && !!current && current.uuid === actor.uuid;
    }

    /**
     * Builds the commands which express an actor's current state at their table position.
     * These use "replaceOrSet", so they leave transient commands (such as a damage flash)
     * further up the position's command stack alone.
     */
    static getActorCommands(actor) {
        const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
        if (!owner) {
            return [];
        }
        const color = ZerowhaleTableSettings.getUserColorCss(owner);
        const statuses = actor.statuses ?? new Set();
        if (statuses.has("charmed")) {
            return ZerowhaleTableCommands.setPlayerRainbowWave(owner.id);
        }
        if (statuses.has("bloodied")) {
            return ZerowhaleTableCommands.setPlayerColorBloodied(owner.id, color);
        }
        return ZerowhaleTableCommands.setPlayerColor(owner.id, color);
    }

    /**
     * Clears the table and lights the position of whoever's turn it now is, as a single batch
     * so the table does not briefly go dark between the two requests.
     */
    static async updateCurrentCombatant(combat, combatantId) {
        const combatant = combatantId ? (combat?.combatants?.get(combatantId) ?? null) : null;
        const commands = ZerowhaleTableCommands.reset().concat(this.getActorCommands(this.getCombatantActor(combatant)));
        await ZerowhaleTableApi.executeCommands(commands);
    }

    static async updateCurrentCombatantActor(actor) {
        await ZerowhaleTableApi.executeCommands(this.getActorCommands(actor));
    }

    /**
     * Refreshes the lights of whoever's turn it currently is. Debounced, both to coalesce
     * bursts of changes (several effects applied at once) into one request and to let Foundry
     * finish re-preparing actor data before the resulting statuses are read.
     */
    static refreshCurrentCombatant() {
        this.#debouncedRefresh ??= foundry.utils.debounce(() => {
            const actor = this.getCurrentCombatantActor();
            if (actor) {
                this.updateCurrentCombatantActor(actor);
            }
        }, REFRESH_DEBOUNCE_MS);
        this.#debouncedRefresh();
    }
}
