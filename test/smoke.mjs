/**
 * Smoke tests for the table module, run against a minimal mock of the Foundry globals.
 *
 * These exist because the module's central concern -- which client talks to the table -- cannot
 * be checked by reading the code: Foundry fires most hooks on every connected client, and only
 * one of them may send a command. Run with `npm test`.
 */

// --- Foundry mock ---------------------------------------------------------------------------

const hooks = {};
globalThis.Hooks = {
    on: (name, fn) => (hooks[name] ??= []).push(fn),
    once: (name, fn) => (hooks[name] ??= []).push(fn),
};
const fire = async (name, ...args) => {
    for (const fn of (hooks[name] ?? [])) await fn(...args);
};

const gm = { id: "gm1", name: "DM", isGM: true, active: true, color: { css: "#ffffff" } };
const p1 = { id: "p1", name: "Alice", isGM: false, active: true, color: { css: "#ff00ff" } };
const users = [gm, p1];
users.get = (id) => users.find(u => u.id === id);
users.activeGM = gm;

const settings = new Map([
    ["zwtable-enabled", true],
    ["zwtable-base-url", "http://table.local/"],
    ["zwtable-debug-logging", false],
    ["zwtable-pos-0", "p1"],
    ["zwtable-pos-1", ""], ["zwtable-pos-2", ""], ["zwtable-pos-3", ""],
    ["zwtable-pos-4", ""], ["zwtable-pos-5", ""],
]);

const actor = {
    name: "Alice's PC", uuid: "Actor.a1", documentName: "Actor",
    statuses: new Set(), testUserPermission: (u) => u.id === "p1",
};

let socketHandler = null;
const emitted = [];
const posted = [];

globalThis.game = {
    user: p1,
    users,
    modules: new Map(),
    settings: { register: () => {}, get: (_module, key) => settings.get(key) },
    socket: { on: (_name, fn) => (socketHandler = fn), emit: (_name, payload) => emitted.push(payload) },
    combat: null,
};
globalThis.foundry = { utils: { debounce: (fn, ms) => (...a) => setTimeout(() => fn(...a), ms) } };
globalThis.fetch = async (url, options) => {
    posted.push({ url, body: JSON.parse(options.body ?? "{}") });
    return { ok: true, status: 200, statusText: "OK", json: async () => [] };
};

// --- Harness --------------------------------------------------------------------------------

let failures = 0;
const check = (label, condition, detail) => {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) {
        failures++;
        if (detail !== undefined) console.log("        ", JSON.stringify(detail));
    }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const reset = () => { posted.length = 0; emitted.length = 0; };

await import("../src/zwtable-foundry.js");
const { ZerowhaleTableCommands } = await import("../src/module/commands.js");

await fire("ready");
reset();

// --- Which client talks to the table ---------------------------------------------------------

game.user = p1;
await fire("dnd5e.applyDamage", actor, 7, {});
check("a player's damage is relayed rather than sent directly",
    posted.length === 0 && emitted.length === 1, { posted, emitted });

game.user = gm;
await socketHandler(emitted[0]);
check("the active GM sends the relayed batch",
    posted.length === 1 && posted[0].url === "http://table.local/api/lights/execute/commands", posted);

posted.length = 0;
game.user = p1;
await socketHandler(emitted[0]);
check("a client that is not the active GM ignores relayed batches", posted.length === 0, posted);

reset();
game.user = gm;
await fire("dnd5e.applyDamage", actor, 7, {});
check("the GM's own damage is sent directly, with no socket round trip",
    posted.length === 1 && emitted.length === 0, { posted, emitted });

reset();
users.activeGM = null;
game.user = p1;
await fire("dnd5e.applyDamage", actor, 7, {});
check("nothing is sent when no GM is connected",
    posted.length === 0 && emitted.length === 0, { posted, emitted });
users.activeGM = gm;

// --- Relayed payloads are not trusted ---------------------------------------------------------

reset();
game.user = gm;
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 99, commandAction: "set" }] });
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "rm -rf" }] });
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "set", commandParameters: { startPixel: "nope" } }] });
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "set", commandParameters: { pixelCount: 1.5 } }] });
check("malformed relayed batches are discarded", posted.length === 0, posted);

await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "set", commandParameters: { startPixel: -3, pixelCount: 3 } }] });
check("well formed relayed batches are forwarded", posted.length === 1, posted);

// --- Command stack conventions -----------------------------------------------------------------

const base = ZerowhaleTableCommands.setPlayerColor("p1", "#ff00ff")[0];
check("the base slot is named 'base'", base.commandParameters.name === "base", base);
check("the base slot spans the whole strip",
    base.commandParameters.startPixel === undefined && base.commandParameters.pixelCount === undefined, base);

const accent = ZerowhaleTableCommands.setPlayerAccent("p1", "#00ffff")[0];
check("the accent slot is named 'accent'", accent.commandParameters.name === "accent", accent);
check("the accent is end-relative, so it does not need to know the strip length",
    accent.commandParameters.startPixel === -3 && accent.commandParameters.pixelCount === 3, accent);
// replaceOrSet would fall back to `set` when no accent is on the stack yet, clearing the stack
// and taking the base layer with it.
check("the accent pushes rather than setting, so it does not clear the base",
    accent.commandAction === "replaceOrPush", accent);

const flash = ZerowhaleTableCommands.flashPlayer("p1", "#ff0000")[0];
check("transient effects are anonymous and always expire",
    flash.commandAction === "push" &&
    flash.commandParameters.name === undefined &&
    Number.isInteger(flash.commandParameters.expirationTime), flash);

check("a player with no table position produces no commands",
    ZerowhaleTableCommands.setPlayerAccent("nobody", "#00ffff").length === 0);

// --- Combat -------------------------------------------------------------------------------------

const combatant = { actor, id: "c1" };
const combat = {
    started: true, round: 1,
    current: { combatantId: "c1" },
    combatants: new Map([["c1", combatant]]),
};
game.combat = combat;

reset();
game.user = p1;
await fire("createActiveEffect", { parent: actor });
game.user = gm;
actor.statuses.add("bloodied");
await fire("createActiveEffect", { parent: actor });
await sleep(200); // let the refresh debounce settle
check("a status change acts exactly once, on the GM",
    posted.length === 1 && emitted.length === 0, { posted, emitted });
check("the bloodied status reaches the table",
    posted[0]?.body?.commands?.[0]?.commandParameters?.colors?.length === 2, posted[0]);

posted.length = 0;
await fire("deleteActiveEffect", { parent: { documentName: "Item", parent: actor } });
await sleep(200);
check("an effect living on an item resolves to the actor that owns it", posted.length === 1, posted);

posted.length = 0;
await fire("combatTurnChange", combat, {}, { combatantId: "c1" });
check("a turn change clears and lights in a single batch",
    posted.length === 1 &&
    posted[0].body.commands.length === 7 &&
    posted[0].body.commands[0].commandAction === "clear" &&
    posted[0].body.commands[6].commandAction === "replaceOrSet", posted[0]?.body?.commands);

reset();
settings.set("zwtable-enabled", false);
game.user = gm;
await fire("dnd5e.applyDamage", actor, 7, {});
check("the disabled setting suppresses everything",
    posted.length === 0 && emitted.length === 0, { posted, emitted });

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
