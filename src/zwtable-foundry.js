import { MODULE_NAME, SLOT_TIMER } from "./module/const.js";
import { ZerowhaleTableApi } from "./module/api.js";
import { ZerowhaleTableCombat } from "./module/combat.js";
import { ZerowhaleTableCommands } from "./module/commands.js";
import { ZerowhaleTableLog } from "./module/log.js";
import { ZerowhaleTableSettings } from "./module/settings.js"
import { ZerowhaleTableTable } from "./module/table.js";
import { getHitPoints } from "./module/states.js";

/**
 * Almost every Foundry hook fires on *every* connected client, so exactly one client has to
 * own the conversation with the table. That client is the active GM; everyone else either
 * stays quiet (for hooks which the GM also receives) or relays over the module socket (for
 * hooks which only fire on the client that performed the action).
 */
function isResponsibleClient() {
    return ZerowhaleTableApi.isResponsibleUser;
}

function effectEnabled(effectId) {
    return ZerowhaleTableSettings.isEffectEnabled(effectId);
}

Hooks.once("ready", async function() {
    ZerowhaleTableSettings.registerSettings();
    ZerowhaleTableSettings.onDisplayChanged = () => ZerowhaleTableTable.refresh();
    ZerowhaleTableApi.registerSocketListener();
    registerModuleApi();

    if (isResponsibleClient()) {
        await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset());
        await applyAmbientScene();
        ZerowhaleTableTable.refresh();
    }
});

/** Exposes the console and macro helpers, both as globals and as the module's public API. */
function registerModuleApi() {
    const api = {
        commands: ZerowhaleTableCommands,
        table: ZerowhaleTableTable,
        execute: async (commands) => await ZerowhaleTableApi.executeCommands(commands),
        scene: async (name) => await ZerowhaleTableApi.executeScene(name),
        refresh: () => ZerowhaleTableTable.refresh(),
        reset: async () => await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset()),
        status: async () => await ZerowhaleTableApi.getStatus(),
        test: async (deviceIndex) => {
            await ZerowhaleTableApi.executeCommands(
                ZerowhaleTableCommands.reset().concat(
                    ZerowhaleTableCommands.setPositionColor(deviceIndex, "#ffffff"))
            );
        },
        /** Assigns a table scene to the Foundry scene currently being viewed. */
        setSceneLighting: async (name) => {
            const scene = game.scenes?.current ?? canvas?.scene;
            if (!scene) {
                ZerowhaleTableLog.warn("No scene is active.");
                return null;
            }
            await scene.setFlag(MODULE_NAME, "tableScene", name ?? "");
            ZerowhaleTableLog.warn(`Scene "${scene.name}" now lights the table with "${name}".`);
            return name;
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
        window.zwtablescene = api.setSceneLighting;
        window.zwtablerefresh = api.refresh;
    }
}

// ---- Ambient scene lighting ----------------------------------------------------------------

/**
 * Runs the table scene named by the active Foundry scene's flag. Only outside combat: during
 * an encounter the table belongs to the turn order.
 */
async function applyAmbientScene() {
    if (!effectEnabled("scenes") || game.combat?.started) {
        return;
    }
    const scene = game.scenes?.active ?? game.scenes?.current;
    const name = scene?.getFlag(MODULE_NAME, "tableScene");
    if (name) {
        ZerowhaleTableLog.debug(`Scene "${scene.name}" lights the table with "${name}".`);
        await ZerowhaleTableApi.executeScene(name);
    }
}

Hooks.on("updateScene", async function(scene, changed, options, userId) {
    if (!isResponsibleClient() || changed.active !== true) {
        return;
    }
    await applyAmbientScene();
});

// ---- Combat --------------------------------------------------------------------------------

Hooks.on("createCombat", async function(combat, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.initiative());
});

Hooks.on("deleteCombat", async function(combat, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    clearTurnTimer();
    await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset());
    await applyAmbientScene();
});

Hooks.on("combatStart", async function(combat, updateData) {
    if (!isResponsibleClient()) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset());
    ZerowhaleTableTable.refresh();
});

Hooks.on("combatTurnChange", async function(combat, prior, current) {
    if (!isResponsibleClient()) {
        return;
    }
    await clearTurnTimerCommands(prior?.combatantId);
    ZerowhaleTableTable.refresh();
    startTurnTimer();
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
            ZerowhaleTableCommands.state(
                ZerowhaleTableSettings.getTablePositionForPlayerId(owner.id),
                "normal",
                ZerowhaleTableSettings.getUserColorCss(owner),
                1)
        );
    }
});

// ---- Turn timer ----------------------------------------------------------------------------

let turnTimerHandle = null;
let turnTimerPosition = -1;

function clearTurnTimer() {
    if (turnTimerHandle !== null) {
        clearTimeout(turnTimerHandle);
        turnTimerHandle = null;
    }
}

/** Takes the amber overlay back off whichever seat had it. */
async function clearTurnTimerCommands() {
    clearTurnTimer();
    if (turnTimerPosition >= 0) {
        const position = turnTimerPosition;
        turnTimerPosition = -1;
        await ZerowhaleTableApi.executeCommands(
            ZerowhaleTableCommands.clearSlot(position, SLOT_TIMER));
    }
}

function startTurnTimer() {
    clearTurnTimer();

    const seconds = ZerowhaleTableSettings.turnTimerSeconds;
    if (seconds <= 0) {
        return;
    }

    const actor = ZerowhaleTableCombat.getCurrentCombatantActor();
    const position = ZerowhaleTableTable.getPositionForActor(actor);
    if (position < 0) {
        return;
    }

    turnTimerHandle = setTimeout(async () => {
        turnTimerHandle = null;
        // Only if it is still the same turn, and this client is still the responsible one.
        if (!isResponsibleClient() || ZerowhaleTableTable.getPositionForActor(
            ZerowhaleTableCombat.getCurrentCombatantActor()) !== position) {
            return;
        }
        turnTimerPosition = position;
        ZerowhaleTableLog.debug(`Turn on position ${position} has run over ${seconds}s.`);
        await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.turnTimer(position));
    }, seconds * 1000);
}

// ---- Status changes ------------------------------------------------------------------------

/**
 * Active effect hooks fire on every client, so only the responsible one acts. This covers every
 * state in the ladder -- bloodied, charmed, unconscious, dead, concentrating -- however caused.
 */
async function onActiveEffectChanged(effect) {
    if (!isResponsibleClient()) {
        return;
    }
    const actor = ZerowhaleTableCombat.getOwningActor(effect);
    if (ZerowhaleTableCombat.isSeated(actor)) {
        ZerowhaleTableTable.refresh();
    }
}

Hooks.on("createActiveEffect", onActiveEffectChanged);
Hooks.on("updateActiveEffect", onActiveEffectChanged);
Hooks.on("deleteActiveEffect", onActiveEffectChanged);

/** Hit points drive the dying state, and are not always changed by an effect. */
Hooks.on("updateActor", async function(actor, changed, options, userId) {
    if (!isResponsibleClient()) {
        return;
    }
    const touchedHitPoints = changed?.system?.attributes?.hp !== undefined;
    const touchedDeathSaves = changed?.system?.attributes?.death !== undefined;
    if ((touchedHitPoints || touchedDeathSaves) && ZerowhaleTableCombat.isSeated(actor)) {
        ZerowhaleTableTable.refresh();
    }
});

// ---- Events --------------------------------------------------------------------------------

/**
 * Unlike the document hooks above, the dnd5e hooks below fire only on the client which
 * performed the action -- usually a player, for their own character. They must NOT be gated on
 * the responsible client; executeCommands() relays them to the GM instead.
 */

Hooks.on("dnd5e.applyDamage", async function(actor, amount, options) {
    if (!effectEnabled("damage") || !amount) {
        return;
    }
    const max = getHitPoints(actor)?.max ?? 0;
    await ZerowhaleTableTable.fireEvent(actor,
        (position) => ZerowhaleTableCommands.damage(position, amount, max));
});

Hooks.on("dnd5e.rollAttackV2", async function(rolls, data) {
    if (!effectEnabled("criticals")) {
        return;
    }
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll?.isCritical && !roll?.isFumble) {
        return;
    }

    const actor = ZerowhaleTableCombat.getSubjectActor(data?.subject);
    await ZerowhaleTableTable.fireEvent(actor, (position) => roll.isCritical
        ? ZerowhaleTableCommands.critical(position)
        : ZerowhaleTableCommands.fumble(position));
});

Hooks.on("dnd5e.rollDeathSaveV2", async function(rolls, details) {
    if (!effectEnabled("deathSaves")) {
        return;
    }
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    const actor = ZerowhaleTableCombat.getSubjectActor(details?.subject);
    // The roll's own total decides this; the actor's counters have not been written yet.
    const succeeded = roll?.isCritical || (roll?.total >= (roll?.options?.target ?? 10));

    await ZerowhaleTableTable.fireEvent(actor, (position) => succeeded
        ? ZerowhaleTableCommands.deathSaveSuccess(position)
        : ZerowhaleTableCommands.deathSaveFailure(position));
});

Hooks.on("dnd5e.beginConcentrating", async function(actor) {
    if (effectEnabled("concentration") && isResponsibleClient()) {
        ZerowhaleTableTable.refresh();
    }
});

Hooks.on("dnd5e.endConcentration", async function(actor) {
    if (effectEnabled("concentration") && isResponsibleClient()) {
        ZerowhaleTableTable.refresh();
    }
});

Hooks.on("dnd5e.restCompleted", async function(actor, result, config) {
    if (!effectEnabled("rest") || !ZerowhaleTableCombat.isSeated(actor)) {
        return;
    }
    await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.restSweep());
});

Hooks.on("targetToken", async function(user, token, targeted) {
    if (!effectEnabled("targeting") || !targeted || !isResponsibleClient()) {
        return;
    }
    const actor = token?.actor ?? null;
    await ZerowhaleTableTable.fireEvent(actor,
        (position) => ZerowhaleTableCommands.targeted(position));
});
