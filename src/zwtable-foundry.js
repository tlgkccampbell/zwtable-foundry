import { MODULE_NAME } from "./module/const.js";
import { ZerowhaleTableApi } from "./module/api.js";
import { ZerowhaleTableCombat } from "./module/combat.js";
import { ZerowhaleTableCommands } from "./module/commands.js";
import { ZerowhaleTableLog } from "./module/log.js";
import { ZerowhaleTableSettings } from "./module/settings.js"

/**
 * Almost every Foundry hook fires on *every* connected client, so exactly one client has to
 * own the conversation with the table. That client is the active GM; everyone else either
 * stays quiet (for hooks which the GM also receives) or relays over the module socket (for
 * hooks which only fire on the client that performed the action).
 */
function isResponsibleClient() {
    return ZerowhaleTableApi.isResponsibleUser;
}

Hooks.once("ready", async function() {
    ZerowhaleTableSettings.registerSettings();
    ZerowhaleTableApi.registerSocketListener();
    registerModuleApi();

    if (isResponsibleClient()) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.reset()
        );
    }
});

/** Exposes the console/macro helpers, both as globals and as the module's public API. */
function registerModuleApi() {
    const api = {
        commands: ZerowhaleTableCommands,
        execute: async (commands) => await ZerowhaleTableApi.executeCommands(commands),
        reset: async () => await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset()),
        status: async () => await ZerowhaleTableApi.getStatus(),
        test: async (deviceIndex) => {
            await ZerowhaleTableApi.executeCommands(
                ZerowhaleTableCommands.reset().concat(
                    ZerowhaleTableCommands.setPositionColor(deviceIndex, "#ffffff"))
            );
        }
    };

    const module = game.modules.get(MODULE_NAME);
    if (module) {
        module.api = api;
    }

    if (game.user?.isGM) {
        window.zwtabletest = api.test;
        window.zwtablereset = api.reset;
        window.zwtablecmd = api.execute;
        window.zwtablestatus = api.status;
    }
}

Hooks.on("createCombat", async function(combat, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(
        ZerowhaleTableCommands.initiative()
    );
});

Hooks.on("deleteCombat", async function(combat, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(
        ZerowhaleTableCommands.reset()
    );
});

Hooks.on("combatStart", async function(combat, updateData) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(
        ZerowhaleTableCommands.reset()
    );
    ZerowhaleTableCombat.refreshCurrentCombatant();
});

Hooks.on("combatTurnChange", async function(combat, prior, current) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableCombat.updateCurrentCombatant(combat, current?.combatantId);
});

Hooks.on("updateCombatant", async function(combatant, changed, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    const combat = combatant.combat ?? combatant.parent;
    if (!combat || combat.round !== 0 || changed.initiative == null) {
        return;
    }
    const actor = ZerowhaleTableCombat.getCombatantActor(combatant);
    const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
    if (owner) {
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.setPlayerColor(owner.id, ZerowhaleTableSettings.getUserColorCss(owner))
        );
    }
});

/**
 * Active effect hooks fire on every client, so only the responsible one acts. This covers
 * status changes (bloodied, charmed) regardless of who caused them.
 */
async function onActiveEffectChanged(effect) {
    if (!isResponsibleClient() || !game.combat?.started) {
        return;
    }
    const actor = ZerowhaleTableCombat.getOwningActor(effect);
    if (!ZerowhaleTableCombat.isCurrentCombatantActor(actor)) {
        return;
    }
    ZerowhaleTableCombat.refreshCurrentCombatant();
}

Hooks.on("createActiveEffect", onActiveEffectChanged);
Hooks.on("updateActiveEffect", onActiveEffectChanged);
Hooks.on("deleteActiveEffect", onActiveEffectChanged);

/**
 * Unlike the hooks above, dnd5e.applyDamage only fires on the client which applied the
 * damage -- usually a player, when they apply damage to their own character. It must NOT be
 * gated on the responsible client; executeCommands() relays it to the GM instead.
 */
Hooks.on("dnd5e.applyDamage", async function(actor, amount, options) {
    const owner = ZerowhaleTableSettings.getConfiguredOwnerOfActor(actor);
    if (owner) {
        ZerowhaleTableLog.debug(`${actor.name} took ${amount} damage; flashing ${owner.name}'s position.`);
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.flashPlayer(owner.id, amount > 0 ? "#ff0000" : "#00ff00")
        );
    }
});
