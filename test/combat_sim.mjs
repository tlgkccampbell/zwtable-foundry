/**
 * Drives the real Foundry module against the real table server. Foundry itself is mocked, but
 * every command sent to the table is produced by the module's own code, fired through its own
 * hooks. Run as: node combat_sim.mjs <phase>
 */

const SERVER = "http://localhost:5000";
const phase = process.argv[2] ?? "1";

// --- Foundry mock ---------------------------------------------------------------------------

const hooks = {};
globalThis.Hooks = {
    on: (n, f) => (hooks[n] ??= []).push(f),
    once: (n, f) => (hooks[n] ??= []).push(f),
};
const fire = async (n, ...a) => { for (const f of (hooks[n] ?? [])) await f(...a); };

function actor(name, ownerId, hp = 30) {
    return {
        name, uuid: `Actor.${name}`, documentName: "Actor", ownerId,
        statuses: new Set(),
        system: { attributes: { hp: { value: hp, max: hp }, death: { success: 0, failure: 0 } } },
        testUserPermission(u) { return u?.id === this.ownerId; },
    };
}

const gm    = { id: "gm", name: "DM",   isGM: true,  active: true, color: { css: "#ffffff" } };
const bram  = { id: "p1", name: "Bram", isGM: false, active: true, color: { css: "#3b9eff" } };
const cara  = { id: "p2", name: "Cara", isGM: false, active: true, color: { css: "#3dd68c" } };
const dana  = { id: "p3", name: "Dana", isGM: false, active: true, color: { css: "#e5484d" } };
const erin  = { id: "p4", name: "Erin", isGM: false, active: true, color: { css: "#8b5cf6" } };
const fen   = { id: "p5", name: "Fen",  isGM: false, active: true, color: { css: "#f5a524" } };

gm.character   = actor("Hobgoblin", "gm", 40);
bram.character = actor("Bram", "p1");
cara.character = actor("Cara", "p2");
dana.character = actor("Dana", "p3");
erin.character = actor("Erin", "p4");
fen.character  = actor("Fen",  "p5");

const users = [gm, bram, cara, dana, erin, fen];
users.get = (id) => users.find(u => u.id === id);
users.activeGM = gm;

const settings = new Map([
    ["zwtable-enabled", true],
    ["zwtable-base-url", SERVER + "/"],
    ["zwtable-debug-logging", false],
    ["zwtable-idle-brightness", 22],
    ["zwtable-turn-timer-seconds", 0],
    ["zwtable-effect-damage", true],
    ["zwtable-effect-criticals", true],
    ["zwtable-effect-concentration", true],
    ["zwtable-effect-deathSaves", true],
    ["zwtable-effect-upNext", true],
    ["zwtable-effect-rest", true],
    ["zwtable-effect-scenes", false],
    ["zwtable-effect-targeting", false],
    ["zwtable-pos-0", "gm"], ["zwtable-pos-1", "p1"], ["zwtable-pos-2", "p2"],
    ["zwtable-pos-3", "p3"], ["zwtable-pos-4", "p4"], ["zwtable-pos-5", "p5"],
]);

globalThis.game = {
    user: gm, users, modules: new Map(),
    scenes: { active: null, current: null },
    settings: { register: () => {}, get: (_m, k) => settings.get(k) },
    socket: { on: () => {}, emit: () => {} },
    combat: null,
};
globalThis.window = globalThis;
globalThis.foundry = { utils: { debounce: (fn, ms) => (...a) => setTimeout(() => fn(...a), ms) } };
// The real fetch, so commands land on the real table.

// --- Scenario -------------------------------------------------------------------------------

const { ZerowhaleTableApi } = await import("../src/module/api.js");
const { ZerowhaleTableCommands } = await import("../src/module/commands.js");
const { ZerowhaleTableTable } = await import("../src/module/table.js");
await import("../src/zwtable-foundry.js");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (s) => console.log(s);
/** Waits out the table's redraw debounce and then a beat, so each step is watchable. */
const beat = (ms = 2600) => sleep(ms);

const order = [
    { id: "c3", user: dana, label: "Dana (pos 3)" },
    { id: "c1", user: bram, label: "Bram (pos 1)" },
    { id: "c0", user: gm,   label: "the hobgoblins (pos 0, DM)" },
    { id: "c4", user: erin, label: "Erin (pos 4)" },
    { id: "c2", user: cara, label: "Cara (pos 2)" },
    { id: "c5", user: fen,  label: "Fen (pos 5)" },
];
const turns = order.map(o => ({ id: o.id, actor: o.user.character }));

function setCombat(turnIndex, started = true) {
    game.combat = {
        started, round: started ? 1 : 0, turn: turnIndex, turns,
        current: { combatantId: turns[turnIndex].id },
        combatants: new Map(turns.map(t => [t.id, t])),
    };
}

async function turnTo(index) {
    const prior = game.combat?.current;
    setCombat(index);
    await fire("combatTurnChange", game.combat, prior, game.combat.current);
    await sleep(200);
}

if (phase === "1") {
    say("── out of combat ────────────────────────────────────────");
    say("   every seat lit dim in its player's colour");
    await ZerowhaleTableApi.executeCommands(ZerowhaleTableCommands.reset());
    ZerowhaleTableTable.refresh();
    await beat(3200);

    say("");
    say("── createCombat ─────────────────────────────────────────");
    await fire("createCombat", {}, {}, "gm");
    await beat(3200);

    say("");
    say("── initiative rolled ────────────────────────────────────");
    setCombat(0, false);
    for (const o of order) {
        say(`   ${o.label}`);
        await fire("updateCombatant",
            { combat: game.combat, actor: o.user.character },
            { initiative: 12 }, {}, "gm");
        await sleep(900);
    }

    say("");
    say("── combatStart ──────────────────────────────────────────");
    setCombat(0);
    await fire("combatStart", game.combat, {});
    await beat(3000);
    say("   Dana bright (her turn), Bram mid (up next), the rest dim");
    await beat(2000);
}

if (phase === "2") {
    setCombat(0);
    ZerowhaleTableTable.refresh();
    await sleep(400);

    say("── Dana's turn (pos 3) ──────────────────────────────────");
    await turnTo(0);
    await beat(2200);

    say("   she crits  → gold flash");
    await fire("dnd5e.rollAttackV2", [{ isCritical: true, isFumble: false }],
        { subject: { actor: dana.character } });
    await beat(2600);

    say("");
    say("── Bram's turn (pos 1) ──────────────────────────────────");
    await turnTo(1);
    await beat(2200);

    say("   he casts a concentration spell  → cyan pulse at the end of his strip");
    bram.character.statuses.add("concentrating");
    await fire("dnd5e.beginConcentrating", bram.character);
    await beat(3400);

    say("");
    say("── the hobgoblins act (pos 0, DM) ───────────────────────");
    await turnTo(2);
    await beat(2000);

    say("   Erin takes 19  → long red flash, then bloodied");
    erin.character.system.attributes.hp.value = 11;
    await fire("dnd5e.applyDamage", erin.character, 19, {});
    await sleep(1400);
    erin.character.statuses.add("bloodied");
    await fire("updateActor", erin.character, { system: { attributes: { hp: {} } } }, {}, "gm");
    await beat(3000);

    say("   Bram takes 4 and loses concentration  → short flash, accent removed");
    bram.character.statuses.delete("concentrating");
    await fire("dnd5e.applyDamage", bram.character, 4, {});
    await fire("dnd5e.endConcentration", bram.character);
    await beat(3000);
}

if (phase === "3") {
    setCombat(3);
    erin.character.system.attributes.hp.value = 11;
    erin.character.statuses.add("bloodied");
    ZerowhaleTableTable.refresh();
    await sleep(400);

    say("── Erin's turn (pos 4), bloodied ────────────────────────");
    await turnTo(3);
    await beat(2600);

    say("   she drops to 0  → red throb, death saves begin");
    erin.character.system.attributes.hp.value = 0;
    erin.character.statuses.delete("bloodied");
    await fire("dnd5e.applyDamage", erin.character, 11, {});
    await sleep(800);
    await fire("updateActor", erin.character, { system: { attributes: { hp: {} } } }, {}, "gm");
    await beat(3400);

    say("   death save: failure  → red flash, one red pip at the far end");
    await fire("dnd5e.rollDeathSaveV2", [{ total: 6, options: { target: 10 } }],
        { subject: erin.character });
    erin.character.system.attributes.death.failure = 1;
    await fire("updateActor", erin.character, { system: { attributes: { death: {} } } }, {}, "gm");
    await beat(3400);

    say("   death save: success  → white flash, one green pip at the near end");
    await fire("dnd5e.rollDeathSaveV2", [{ total: 17, options: { target: 10 } }],
        { subject: erin.character });
    erin.character.system.attributes.death.success = 1;
    await fire("updateActor", erin.character, { system: { attributes: { death: {} } } }, {}, "gm");
    await beat(3400);

    say("   another success  → two green pips against one red");
    await fire("dnd5e.rollDeathSaveV2", [{ total: 14, options: { target: 10 } }],
        { subject: erin.character });
    erin.character.system.attributes.death.success = 2;
    await fire("updateActor", erin.character, { system: { attributes: { death: {} } } }, {}, "gm");
    await beat(3600);

    say("");
    say("── Cara's turn (pos 2) ──────────────────────────────────");
    await turnTo(4);
    await beat(2000);
    say("   she heals Erin for 9  → green flash, Erin back to normal");
    erin.character.system.attributes.hp.value = 9;
    erin.character.system.attributes.death = { success: 0, failure: 0 };
    await fire("dnd5e.applyDamage", erin.character, -9, {});
    await fire("updateActor", erin.character, { system: { attributes: { hp: {} } } }, {}, "gm");
    await beat(3400);

    say("");
    say("── the fight ends ───────────────────────────────────────");
    say("   the party takes a short rest  → warm light travels around the table");
    await fire("dnd5e.restCompleted", cara.character, {}, {});
    await sleep(7000);

    say("   deleteCombat  → table goes dark");
    game.combat = null;
    await fire("deleteCombat", {}, {}, "gm");
    await sleep(1200);
}
