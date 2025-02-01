import { ZerowhaleTableApi } from "./api.js";
import { ZerowhaleTableCommands } from "./commands.js";

export class ZerowhaleTableCombat {
    static getCurrentCombatantActor() {
        if (game.combat && game.combat.current) {
            let combatant = game.combat.combatants.get(game.combat.current.combatantId);
            let scene = game.scenes.get(combatant.sceneId);
            let token = scene.tokens.get(game.combat.current.tokenId);
            let actor = game.actors.get(token.actorId);    
            return actor;
        }
        return null;
    }

    static async updateCurrentCombatant(combat, combatantId, tokenId) {
        let combatant = combat.combatants.get(combatantId);
        let scene = game.scenes.get(combatant.sceneId);
        let token = scene.tokens.get(tokenId);
        let actor = game.actors.get(token.actorId);
        return await this.updateCurrentCombatantActor(actor);
    }

    static async updateCurrentCombatantActor(actor) {
        let owner = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER")) || game.users.find(u => u.isGM);
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