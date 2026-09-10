import {
    EMPHASIS_ACTIVE,
    EMPHASIS_IDLE,
    EMPHASIS_NEXT,
    NEXT_BRIGHTNESS,
    SLOT_ACCENT,
    SLOT_PIPS,
    TABLE_POSITIONS
} from "./const.js";
import { ZerowhaleTableApi } from "./api.js";
import { ZerowhaleTableCommands } from "./commands.js";
import { ZerowhaleTableCombat } from "./combat.js";
import { ZerowhaleTableLog } from "./log.js";
import { ZerowhaleTableSettings } from "./settings.js";
import { getDeathSaves, isConcentrating, resolveState } from "./states.js";

/** How long to coalesce rapid changes before redrawing, in milliseconds. */
const REFRESH_DEBOUNCE_MS = 100;

/**
 * Draws the table.
 *
 * Every seated player's position is lit, not only whoever's turn it is: the active seat at full
 * brightness, the seat which is up next dimmer, and the rest dimmer still. That way the table is
 * a party status board -- who is bloodied, who is charmed, who is concentrating -- while still
 * making the current turn obvious.
 */
export class ZerowhaleTableTable {
    static #debouncedRefresh = null;

    /** Redraws the table, coalescing bursts of changes into a single batch of commands. */
    static refresh() {
        this.#debouncedRefresh ??= foundry.utils.debounce(() => this.refreshNow(), REFRESH_DEBOUNCE_MS);
        this.#debouncedRefresh();
    }

    static async refreshNow() {
        const commands = this.buildCommands();
        if (commands.length) {
            await ZerowhaleTableApi.executeCommands(commands);
        }
    }

    /** Builds the commands which express the table's entire current state. */
    static buildCommands() {
        const emphasis = this.getEmphasisByPosition();
        const idleBrightness = ZerowhaleTableSettings.idleBrightness;

        const commands = [];
        for (let position = 0; position < TABLE_POSITIONS; position++) {
            const playerId = ZerowhaleTableSettings.getPlayerIdAtPosition(position);
            if (!playerId) {
                commands.push({ "deviceIndex": position, "commandAction": "clear" });
                continue;
            }

            const owner = game.users.get(playerId);
            const actor = this.getActorForPlayer(owner);
            if (!owner || !actor) {
                commands.push({ "deviceIndex": position, "commandAction": "clear" });
                continue;
            }

            const brightness = this.getBrightness(emphasis[position], idleBrightness);
            if (brightness <= 0) {
                commands.push({ "deviceIndex": position, "commandAction": "clear" });
                continue;
            }

            commands.push(...this.buildSeatCommands(position, actor, owner, brightness));
        }
        return commands;
    }

    /** Base layer plus overlays for one seat. Every slot is either set or explicitly retired. */
    static buildSeatCommands(position, actor, owner, brightness) {
        const commands = [];
        const color = ZerowhaleTableSettings.getUserColorCss(owner);
        const deathSavesEnabled = ZerowhaleTableSettings.isEffectEnabled("deathSaves");

        // Turning the death save effect off covers the throb as well as the pips, so a downed
        // character falls back to being drawn as merely unconscious.
        let stateId = resolveState(actor);
        if (stateId === "dying" && !deathSavesEnabled) {
            stateId = "unconscious";
        }

        commands.push(...ZerowhaleTableCommands.state(position, stateId, color, brightness));

        // While dying, both ends of the strip show death save progress, which outranks the
        // concentration accent -- a character at zero hit points is not concentrating anyway.
        if (stateId === "dying") {
            const saves = getDeathSaves(actor) ?? { success: 0, failure: 0 };
            commands.push(...ZerowhaleTableCommands.deathSaves(
                position, saves.success, saves.failure, brightness));
            return commands;
        }

        commands.push(...ZerowhaleTableCommands.clearSlot(position, SLOT_PIPS));

        if (ZerowhaleTableSettings.isEffectEnabled("concentration") && isConcentrating(actor)) {
            commands.push(...ZerowhaleTableCommands.concentration(position, brightness));
        } else {
            commands.push(...ZerowhaleTableCommands.clearSlot(position, SLOT_ACCENT));
        }

        return commands;
    }

    static getBrightness(emphasis, idleBrightness) {
        if (emphasis === EMPHASIS_ACTIVE) {
            return 1;
        }
        if (emphasis === EMPHASIS_NEXT) {
            // Never brighter than an idle seat has been configured to be.
            return Math.max(idleBrightness, Math.min(NEXT_BRIGHTNESS, idleBrightness > 0 ? NEXT_BRIGHTNESS : 0));
        }
        return idleBrightness;
    }

    /**
     * Works out which seat is active and which is up next. Outside combat no seat is either,
     * so every seat is drawn at the idle brightness.
     */
    static getEmphasisByPosition() {
        const emphasis = new Array(TABLE_POSITIONS).fill(EMPHASIS_IDLE);

        const combat = game.combat;
        if (!combat?.started) {
            return emphasis;
        }

        const mark = (combatant, value) => {
            const actor = ZerowhaleTableCombat.getCombatantActor(combatant);
            const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
            if (!owner) {
                return;
            }
            const position = ZerowhaleTableSettings.getTablePositionForPlayerId(owner.id);
            if (position >= 0 && emphasis[position] === EMPHASIS_IDLE) {
                emphasis[position] = value;
            }
        };

        mark(ZerowhaleTableCombat.getCurrentCombatant(), EMPHASIS_ACTIVE);

        if (ZerowhaleTableSettings.isEffectEnabled("upNext")) {
            mark(ZerowhaleTableCombat.getNextCombatant(), EMPHASIS_NEXT);
        }

        return emphasis;
    }

    /**
     * The actor a seated player's lights should follow: their assigned character if they have
     * one, and otherwise whichever combatant in the current encounter they own.
     */
    static getActorForPlayer(user) {
        if (!user) {
            return null;
        }
        if (user.character) {
            return user.character;
        }

        const combat = game.combat;
        if (combat) {
            for (const combatant of combat.combatants) {
                const actor = ZerowhaleTableCombat.getCombatantActor(combatant);
                if (actor?.testUserPermission(user, "OWNER")) {
                    return actor;
                }
            }
        }
        return null;
    }

    /** The seat a given actor sits at, or -1. */
    static getPositionForActor(actor) {
        const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
        if (!owner) {
            return -1;
        }
        return ZerowhaleTableSettings.getTablePositionForPlayerId(owner.id);
    }

    /** Sends a transient effect for whichever seat an actor occupies. */
    static async fireEvent(actor, buildCommands) {
        const position = this.getPositionForActor(actor);
        if (position < 0) {
            return;
        }
        const commands = buildCommands(position);
        if (commands?.length) {
            ZerowhaleTableLog.debug(`Event on position ${position} for ${actor?.name}.`, commands);
            await ZerowhaleTableApi.executeCommands(commands);
        }
    }
}
