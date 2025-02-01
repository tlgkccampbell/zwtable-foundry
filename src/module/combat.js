import { ZerowhaleTableApi } from "./api.js";
import { ZerowhaleTableCommands } from "./commands.js";
import { ZerowhaleTableSettings } from "./settings.js";

export class ZerowhaleTableCombat {
    static getCombatantActor(combatant) {
        let actor = game.actors.get(combatant.actorId);    
        return actor;
    }

    static getCurrentCombatantActor() {
        if (game.combat && game.combat.current) {
            let combatant = game.combat.combatants.get(game.combat.current.combatantId);
            return this.getCombatantActor(combatant);
        }
        return null;
    }

    static async updateCurrentCombatant(combat, combatantId, tokenId) {
        let combatant = combat.combatants.get(combatantId);
        let actor = game.actors.get(combatant.actorId);
        return await this.updateCurrentCombatantActor(actor);
    }

    static async updateCurrentCombatantActor(actor) {
        let owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
        if (owner) {
            if (actor.statuses.has("charmed")) {
                await ZerowhaleTableApi.executeCommands(
                    ZerowhaleTableCommands.setPlayerRainbowWave(owner._id)
                );
            } else if (actor.statuses.has("bloodied")) {
                await ZerowhaleTableApi.executeCommands(
                    ZerowhaleTableCommands.setPlayerColorBloodied(owner._id, owner.color.css)
                );
            } else {
                await ZerowhaleTableApi.executeCommands(
                    ZerowhaleTableCommands.setPlayerColor(owner._id, owner.color.css)
                );
            }
        }
    }
}