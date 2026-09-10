import { ZerowhaleTableCommands } from "./commands.js";
import { ZerowhaleTableSettings } from "./settings.js";

export class ZerowhaleTableCombat {
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
     * The combatant whose turn follows the current one, wrapping to the top of the order at the
     * end of a round. Null if the encounter has not started or has no living turn order.
     */
    static getNextCombatant() {
        const combat = game.combat;
        if (!combat?.started) {
            return null;
        }

        const turns = combat.turns ?? [];
        if (turns.length < 2 || typeof combat.turn !== "number") {
            return null;
        }
        return turns[(combat.turn + 1) % turns.length] ?? null;
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

    /** Whether an actor sits at the table at all, and so is worth reacting to. */
    static isSeated(actor) {
        const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
        return !!owner && ZerowhaleTableSettings.getTablePositionForPlayerId(owner.id) >= 0;
    }

    /** The actor an activity, roll subject or chat message subject belongs to. */
    static getSubjectActor(subject) {
        if (!subject) {
            return null;
        }
        if (subject.documentName === "Actor") {
            return subject;
        }
        return subject.actor ?? this.getOwningActor(subject) ?? null;
    }

    /** Convenience wrapper kept for macros written against earlier versions. */
    static resetCommands() {
        return ZerowhaleTableCommands.reset();
    }
}
