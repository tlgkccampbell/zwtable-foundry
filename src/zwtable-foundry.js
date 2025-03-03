import { ZerowhaleTableApi } from "./module/api.js";
import { ZerowhaleTableCombat } from "./module/combat.js";
import { ZerowhaleTableCommands } from "./module/commands.js";
import { ZerowhaleTableSettings } from "./module/settings.js"

Hooks.on("ready", async function() {
    ZerowhaleTableSettings.registerSettings();
    if (game.user?.isGM) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.reset()
        );

        window.zwtabletest = async (deviceIndex) => {
            await ZerowhaleTableApi.executeCommands(
                ZerowhaleTableCommands.reset()
            )
            await ZerowhaleTableApi.executeCommands(
                ZerowhaleTableCommands.setPositionColor(deviceIndex, "#ffffff")
            )
        };

        window.zwtablereset = async () => {
            await ZerowhaleTableApi.executeCommands(
                ZerowhaleTableCommands.reset()
            )
        };

        window.zwtablecmd = async (commands) => {
            await ZerowhaleTableApi.executeCommands(commands);
        }
    }
})

Hooks.on("createCombat", async function() {
    if (game.user?.isGM) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.initiative()
        );
    }
});

Hooks.on("combatStart", async function(combat, updateData) {
    if (game.user?.isGM) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.reset()
        )
    }
});

Hooks.on("combatTurnChange", async function(combat, prior, current) {
    if (game.user?.isGM) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.reset()
        );

        await ZerowhaleTableCombat.updateCurrentCombatant(combat, current.combatantId, current.tokenId);
    }
});


Hooks.on("updateCombatant", async function(combatant, changed, options, userId) {
    if (game.user?.isGM) {
        let combat = combatant.combat;
        if (combat && combat.current.round == 0 && changed.initiative) {             
            let actor = ZerowhaleTableCombat.getCombatantActor(combatant);
            let owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
            if (owner) {
                await ZerowhaleTableApi.executeCommands(
                    ZerowhaleTableCommands.setPlayerColor(owner._id, owner.color.css)
                );
            }
        }
    }
});

Hooks.on("createActiveEffect", async function(data, options, userId) {
    if (data.parent instanceof Actor) {
        let combat = game.combat;
        if (combat && combat.current) {
            let currentCombatantActor = ZerowhaleTableCombat.getCurrentCombatantActor();
            if (currentCombatantActor === data.parent) {
                await ZerowhaleTableCombat.updateCurrentCombatantActor(currentCombatantActor);
            }
        }
    }
});

Hooks.on("deleteActiveEffect", async function(data, options, userId) {
    if (data.parent instanceof Actor) {
        let combat = game.combat;
        if (combat && combat.current) {
            let currentCombatantActor = ZerowhaleTableCombat.getCurrentCombatantActor();
            if (currentCombatantActor === data.parent) {
                await ZerowhaleTableCombat.updateCurrentCombatantActor(currentCombatantActor);
            }
        }
    }
});

Hooks.on("dnd5e.applyDamage", async function(actor, amount, options) {
    let owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
    if (owner) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.flashPlayer(owner._id, amount > 0 ? "#ff0000" : "#00ff00")
        );
    }
});