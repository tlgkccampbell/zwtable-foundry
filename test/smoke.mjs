/**
 * Smoke tests for the table module, run against a minimal mock of the Foundry globals.
 *
 * These exist because the module's central concerns cannot be checked by reading the code:
 * which client ends up talking to the table (Foundry fires most hooks on every connected
 * client, and exactly one may send a command), and what the table is asked to show for a given
 * combination of state, emphasis and settings. Run with `npm test`.
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

function makeActor(name, { hp = 20, max = 20, statuses = [], death = { success: 0, failure: 0 } } = {}) {
    return {
        name,
        uuid: `Actor.${name}`,
        documentName: "Actor",
        statuses: new Set(statuses),
        system: { attributes: { hp: { value: hp, max }, death: { ...death } } },
        testUserPermission(user) { return user?.id === this.ownerId; },
        ownerId: null,
    };
}

const gm = { id: "gm1", name: "DM", isGM: true, active: true, color: { css: "#ffffff" } };
const alice = { id: "p1", name: "Alice", isGM: false, active: true, color: { css: "#ff0000" } };
const bram = { id: "p2", name: "Bram", isGM: false, active: true, color: { css: "#00ff00" } };
const cara = { id: "p3", name: "Cara", isGM: false, active: true, color: { css: "#0000ff" } };

const aliceActor = makeActor("Alice-PC"); aliceActor.ownerId = "p1"; alice.character = aliceActor;
const bramActor = makeActor("Bram-PC");   bramActor.ownerId = "p2";  bram.character = bramActor;
const caraActor = makeActor("Cara-PC");   caraActor.ownerId = "p3";  cara.character = caraActor;

const users = [gm, alice, bram, cara];
users.get = (id) => users.find(u => u.id === id);
users.activeGM = gm;

const DEFAULT_SETTINGS = [
    ["zwtable-enabled", true],
    ["zwtable-base-url", "http://table.local/"],
    ["zwtable-debug-logging", false],
    ["zwtable-idle-brightness", 20],
    ["zwtable-turn-timer-seconds", 0],
    ["zwtable-reversed-positions", ""],
    ["zwtable-effect-damage", true],
    ["zwtable-effect-criticals", true],
    ["zwtable-effect-concentration", true],
    ["zwtable-effect-deathSaves", true],
    ["zwtable-effect-upNext", true],
    ["zwtable-effect-rest", true],
    ["zwtable-effect-scenes", true],
    ["zwtable-effect-targeting", false],
    ["zwtable-pos-0", "p1"],
    ["zwtable-pos-1", "p2"],
    ["zwtable-pos-2", "p3"],
    ["zwtable-pos-3", ""], ["zwtable-pos-4", ""], ["zwtable-pos-5", ""],
];
const settings = new Map(DEFAULT_SETTINGS);

let socketHandler = null;
const emitted = [];
const posted = [];

globalThis.game = {
    user: gm,
    users,
    modules: new Map(),
    scenes: { active: null, current: null },
    settings: { register: () => {}, get: (_m, key) => settings.get(key) },
    socket: { on: (_n, fn) => (socketHandler = fn), emit: (_n, payload) => emitted.push(payload) },
    combat: null,
};
globalThis.foundry = { utils: { debounce: (fn, ms) => (...a) => setTimeout(() => fn(...a), ms) } };
globalThis.window = globalThis;
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

function resetWorld() {
    settings.clear();
    for (const [k, v] of DEFAULT_SETTINGS) settings.set(k, v);
    for (const actor of [aliceActor, bramActor, caraActor]) {
        actor.statuses = new Set();
        actor.system.attributes.hp = { value: 20, max: 20 };
        actor.system.attributes.death = { success: 0, failure: 0 };
    }
    game.combat = null;
    game.user = gm;
    reset();
}

/** All commands from the last batch that targeted a given position. */
const forPosition = (batch, position) =>
    (batch?.body?.commands ?? []).filter(c => c.deviceIndex === position);

const slot = (batch, position, name) =>
    forPosition(batch, position).find(c => c.commandParameters?.name === name);

const { ZerowhaleTableCommands } = await import("../src/module/commands.js");
const { ZerowhaleTableTable } = await import("../src/module/table.js");
const { resolveState } = await import("../src/module/states.js");
await import("../src/zwtable-foundry.js");

await fire("ready");
await sleep(250);
resetWorld();

/** Triggers a table redraw and waits for the debounce to settle. */
async function redraw() {
    reset();
    ZerowhaleTableTable.refresh();
    await sleep(250);
    return posted[0];
}

// --- Which client talks to the table ---------------------------------------------------------

game.user = alice;
await fire("dnd5e.applyDamage", aliceActor, 7, {});
check("a player's damage is relayed rather than sent directly",
    posted.length === 0 && emitted.length === 1, { posted, emitted });

game.user = gm;
await socketHandler(emitted[0]);
check("the active GM sends the relayed batch",
    posted.length === 1 && posted[0].url === "http://table.local/api/lights/execute/commands", posted);

posted.length = 0;
game.user = alice;
await socketHandler(emitted[0]);
check("a client that is not the active GM ignores relayed batches", posted.length === 0, posted);

resetWorld();
await fire("dnd5e.applyDamage", aliceActor, 7, {});
check("the GM's own damage is sent directly, with no socket round trip",
    posted.length === 1 && emitted.length === 0, { posted, emitted });

resetWorld();
users.activeGM = null;
game.user = alice;
await fire("dnd5e.applyDamage", aliceActor, 7, {});
check("nothing is sent when no GM is connected",
    posted.length === 0 && emitted.length === 0, { posted, emitted });
users.activeGM = gm;

// --- Relayed payloads are not trusted ---------------------------------------------------------

resetWorld();
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 99, commandAction: "set" }] });
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "rm -rf" }] });
await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "set", commandParameters: { startPixel: "nope" } }] });
await socketHandler({ type: "executeScene", userId: "p1", name: 42 });
await socketHandler({ type: "executeScene", userId: "p1", name: "x".repeat(200) });
check("malformed relayed payloads are discarded", posted.length === 0, posted);

await socketHandler({ type: "executeCommands", userId: "p1", commands: [{ deviceIndex: 0, commandAction: "remove", commandParameters: { name: "accent" } }] });
check("the remove action is accepted", posted.length === 1, posted);

// --- Every seat is drawn, not only the active one ----------------------------------------------

resetWorld();
let batch = await redraw();
check("out of combat, every seated position is drawn",
    [0, 1, 2].every(p => forPosition(batch, p).length > 0), batch?.body?.commands);
check("unseated positions are cleared",
    [3, 4, 5].every(p => forPosition(batch, p).some(c => c.commandAction === "clear")), batch?.body?.commands);

const aliceBase = slot(batch, 0, "base");
check("an idle seat is dimmed to the configured brightness",
    aliceBase?.commandParameters?.colors[0].color === "#330000", aliceBase);

settings.set("zwtable-idle-brightness", 0);
batch = await redraw();
check("idle brightness of 0 restores the old behaviour of lighting nobody out of combat",
    [0, 1, 2].every(p => forPosition(batch, p).every(c => c.commandAction === "clear")), batch?.body?.commands);
settings.set("zwtable-idle-brightness", 20);

// --- Emphasis in combat -------------------------------------------------------------------------

function startCombat(currentIndex) {
    const combatants = [
        { id: "c1", actor: aliceActor },
        { id: "c2", actor: bramActor },
        { id: "c3", actor: caraActor },
    ];
    game.combat = {
        started: true, round: 1, turn: currentIndex,
        turns: combatants,
        current: { combatantId: combatants[currentIndex].id },
        combatants: new Map(combatants.map(c => [c.id, c])),
    };
}

resetWorld();
startCombat(0);
batch = await redraw();
check("the active seat is at full brightness",
    slot(batch, 0, "base")?.commandParameters?.colors[0].color === "#ff0000", slot(batch, 0, "base"));
check("the seat whose turn is next is brighter than idle but not full",
    slot(batch, 1, "base")?.commandParameters?.colors[0].color === "#007300", slot(batch, 1, "base"));
check("the remaining seats stay at idle brightness",
    slot(batch, 2, "base")?.commandParameters?.colors[0].color === "#000033", slot(batch, 2, "base"));

settings.set("zwtable-effect-upNext", false);
batch = await redraw();
check("turning off Up Next drops the next seat back to idle",
    slot(batch, 1, "base")?.commandParameters?.colors[0].color === "#003300", slot(batch, 1, "base"));
settings.set("zwtable-effect-upNext", true);

startCombat(2);
batch = await redraw();
check("the turn order wraps, so the last combatant's next is the first",
    slot(batch, 0, "base")?.commandParameters?.colors[0].color === "#730000", slot(batch, 0, "base"));

// --- The state ladder ------------------------------------------------------------------------

resetWorld();
check("a healthy character is normal", resolveState(aliceActor) === "normal");
aliceActor.statuses.add("bloodied");
check("bloodied outranks normal", resolveState(aliceActor) === "bloodied");
aliceActor.statuses.add("charmed");
check("charmed outranks bloodied", resolveState(aliceActor) === "charmed");
aliceActor.statuses.add("unconscious");
check("unconscious outranks charmed", resolveState(aliceActor) === "unconscious");
aliceActor.system.attributes.hp.value = 0;
check("dying outranks unconscious", resolveState(aliceActor) === "dying");
aliceActor.statuses.add("dead");
check("dead outranks everything", resolveState(aliceActor) === "dead");

resetWorld();
aliceActor.statuses.add("bloodied");
batch = await redraw();
check("bloodied draws red alternating with the player's colour",
    slot(batch, 0, "base")?.commandParameters?.colors?.length === 2, slot(batch, 0, "base"));

resetWorld();
aliceActor.statuses.add("charmed");
batch = await redraw();
check("charmed draws a rainbow",
    slot(batch, 0, "base")?.commandType === "RandomColors", slot(batch, 0, "base"));

// --- Death saves ------------------------------------------------------------------------------

resetWorld();
aliceActor.system.attributes.hp.value = 0;
aliceActor.system.attributes.death = { success: 2, failure: 1 };
batch = await redraw();
check("a dying character throbs red",
    slot(batch, 0, "base")?.commandType === "Throb", slot(batch, 0, "base"));

const pips = slot(batch, 0, "pips");
const accent = slot(batch, 0, "accent");
check("successes light pips at the near end of the strip",
    pips?.commandParameters?.startPixel === 0 &&
    pips?.commandParameters?.colors.filter(c => c.color !== "#000000").length === 2, pips);
check("failures light pips at the far end of the strip",
    accent?.commandParameters?.startPixel === -3 &&
    accent?.commandParameters?.colors.filter(c => c.color !== "#000000").length === 1, accent);

settings.set("zwtable-effect-deathSaves", false);
batch = await redraw();
check("turning off Death Saves retires both pip slots",
    ["pips", "accent"].every(name =>
        slot(batch, 0, name)?.commandAction === "remove"), forPosition(batch, 0));
check("and draws a downed character as merely unconscious",
    slot(batch, 0, "base")?.commandType === "SetPixels", slot(batch, 0, "base"));

// --- Concentration ------------------------------------------------------------------------------

resetWorld();
aliceActor.statuses.add("concentrating");
batch = await redraw();
const conc = slot(batch, 0, "accent");
check("concentration pulses at the far end without disturbing the base",
    conc?.commandType === "Throb" && conc?.commandAction === "replaceOrPush" &&
    conc?.commandParameters?.startPixel === -3, conc);
check("the base is still drawn underneath the concentration accent",
    slot(batch, 0, "base")?.commandType === "SetPixels", slot(batch, 0, "base"));

aliceActor.statuses.delete("concentrating");
batch = await redraw();
check("dropping concentration removes the accent rather than blacking it out",
    forPosition(batch, 0).some(c => c.commandAction === "remove" && c.commandParameters.name === "accent"),
    forPosition(batch, 0));

// --- Events ---------------------------------------------------------------------------------

resetWorld();
await fire("dnd5e.applyDamage", aliceActor, 2, {});
const small = posted[0]?.body?.commands[0];
reset();
await fire("dnd5e.applyDamage", aliceActor, 20, {});
const big = posted[0]?.body?.commands[0];
check("a big hit flashes for longer than a scratch",
    big.commandParameters.expirationTime > small.commandParameters.expirationTime,
    { small: small?.commandParameters, big: big?.commandParameters });
check("transient effects are anonymous and always expire",
    big.commandAction === "push" && big.commandParameters.name === undefined &&
    Number.isInteger(big.commandParameters.expirationTime), big);

reset();
await fire("dnd5e.applyDamage", aliceActor, -8, {});
check("healing flashes green",
    posted[0]?.body?.commands[0]?.commandParameters?.colors[0].color === "#00ff00", posted[0]);

reset();
await fire("dnd5e.rollAttackV2", [{ isCritical: true, isFumble: false }], { subject: { actor: aliceActor } });
check("a critical flashes gold",
    posted[0]?.body?.commands[0]?.commandParameters?.colors[0].color === "#ffd23f", posted[0]);

reset();
await fire("dnd5e.rollAttackV2", [{ isCritical: false, isFumble: true }], { subject: { actor: aliceActor } });
check("a fumble flashes dark red",
    posted[0]?.body?.commands[0]?.commandParameters?.colors[0].color === "#7a0b0b", posted[0]);

reset();
await fire("dnd5e.rollAttackV2", [{ isCritical: false, isFumble: false }], { subject: { actor: aliceActor } });
check("an ordinary attack does nothing", posted.length === 0, posted);

reset();
settings.set("zwtable-effect-criticals", false);
await fire("dnd5e.rollAttackV2", [{ isCritical: true }], { subject: { actor: aliceActor } });
check("turning off Criticals suppresses them", posted.length === 0, posted);
settings.set("zwtable-effect-criticals", true);

reset();
await fire("dnd5e.rollDeathSaveV2", [{ total: 15, options: { target: 10 } }], { subject: aliceActor });
check("a successful death save flashes white",
    posted[0]?.body?.commands[0]?.commandParameters?.colors[0].color === "#ffffff", posted[0]);

reset();
await fire("dnd5e.rollDeathSaveV2", [{ total: 4, options: { target: 10 } }], { subject: aliceActor });
check("a failed death save flashes red",
    posted[0]?.body?.commands[0]?.commandParameters?.colors[0].color === "#ff2d2d", posted[0]);

reset();
await fire("dnd5e.restCompleted", aliceActor, {}, {});
check("a rest sweeps every position with a staggered crawl",
    posted[0]?.body?.commands.length === 6 &&
    posted[0].body.commands.every(c => c.commandType === "DotCrawl") &&
    posted[0].body.commands[1].commandParameters.delayStart >
    posted[0].body.commands[0].commandParameters.delayStart, posted[0]?.body?.commands);

reset();
await fire("targetToken", gm, { actor: aliceActor }, true);
check("targeting is off by default", posted.length === 0, posted);
settings.set("zwtable-effect-targeting", true);
await fire("targetToken", gm, { actor: aliceActor }, true);
check("targeting flashes once switched on", posted.length === 1, posted);
settings.set("zwtable-effect-targeting", false);

// --- Scenes -----------------------------------------------------------------------------------

resetWorld();
const tavern = { name: "The Tavern", getFlag: () => "tavern" };
game.scenes.active = tavern;
await fire("updateScene", tavern, { active: true }, {}, "gm1");
check("activating a scene runs its table scene",
    posted.some(p => p.url.endsWith("/api/lights/execute/scene") && p.body.name === "tavern"), posted);

reset();
startCombat(0);
await fire("updateScene", tavern, { active: true }, {}, "gm1");
check("scene lighting stays out of the way during combat", posted.length === 0, posted);

resetWorld();
game.scenes.active = { name: "Blank", getFlag: () => null };
await fire("updateScene", game.scenes.active, { active: true }, {}, "gm1");
check("a scene with no table scene configured does nothing", posted.length === 0, posted);

// --- Table geometry and the initiative wave -------------------------------------------------

resetWorld();
const { ZerowhaleTableGeometry } = await import("../src/module/geometry.js");
const { ZerowhaleTableSettings } = await import("../src/module/settings.js");
const ZerowhaleTableSettings_reversedForDebug = () => ZerowhaleTableSettings.reversedPositions;

check("the ring totals every strip's LEDs",
    ZerowhaleTableGeometry.totalPixels === 104, ZerowhaleTableGeometry.totalPixels);
check("offsets accumulate around the ring",
    [0, 22, 37, 52, 74, 89].every((expected, i) => ZerowhaleTableGeometry.getOffset(i) === expected),
    [0,1,2,3,4,5].map(i => ZerowhaleTableGeometry.getOffset(i)));

check("no strips are treated as reversed by default",
    [0, 1, 2, 3, 4, 5].every(p => !ZerowhaleTableGeometry.isReversed(p)) &&
    ZerowhaleTableGeometry.getWaveParametersForAll(90).every(w => w.reverse === false),
    ZerowhaleTableSettings_reversedForDebug());

settings.set("zwtable-reversed-positions", "3,4,5");
check("reversed positions are read from the setting",
    [3, 4, 5].every(p => ZerowhaleTableGeometry.isReversed(p)) &&
    [0, 1, 2].every(p => !ZerowhaleTableGeometry.isReversed(p)));

settings.set("zwtable-reversed-positions", " 2 , 9 , x ");
check("nonsense in the reversed positions setting is ignored",
    ZerowhaleTableGeometry.isReversed(2) && !ZerowhaleTableGeometry.isReversed(9),
    settings.get("zwtable-reversed-positions"));
settings.set("zwtable-reversed-positions", "3,4,5");

const waves = ZerowhaleTableGeometry.getWaveParametersForAll(90);
check("each strip is given its own share of the wave",
    Math.abs(waves[0].angleMultiplier - 22 / 104) < 1e-9 &&
    Math.abs(waves[1].angleMultiplier - 15 / 104) < 1e-9, waves.map(w => w.angleMultiplier));
check("loop durations are fractional, so the strips do not drift apart",
    waves.some(w => !Number.isInteger(w.loopDuration)), waves.map(w => w.loopDuration));
check("every strip turns at the same rate",
    waves.every(w => Math.abs((w.loopDuration / w.angleMultiplier) - 90) < 1e-9),
    waves.map(w => w.loopDuration / w.angleMultiplier));
check("phases follow the strips' positions around the ring",
    waves.every((w, i) => Math.abs(w.phase - ZerowhaleTableGeometry.getOffset(i) / 104) < 1e-9),
    waves.map(w => w.phase));
check("the reversed strips are marked as such",
    waves.map(w => w.reverse).join() === "false,false,false,true,true,true",
    waves.map(w => w.reverse));

reset();
await fire("createCombat", {}, {}, "gm");
const sweep = posted[0]?.body?.commands ?? [];
check("the initiative sweep sends one wave slice per position",
    sweep.length === 6 && sweep.every(c => c.commandType === "SineWave"), sweep);
check("and carries the phase and direction of each strip",
    sweep[3]?.commandParameters?.reverse === true &&
    sweep[0]?.commandParameters?.reverse === false &&
    Math.abs(sweep[3].commandParameters.phase - 52 / 104) < 1e-9, sweep.map(c => c.commandParameters));

check("the wiring diagnostic lights the first LEDs of every strip",
    (() => {
        const cmds = ZerowhaleTableCommands.wiringDiagnostic();
        const pips = cmds.filter(c => c.commandParameters?.name === "pips");
        return pips.length === 6 && pips.every(c => c.commandParameters.startPixel === 0 &&
            c.commandParameters.pixelCount === 3);
    })());

// --- Master switch ------------------------------------------------------------------------------

resetWorld();
settings.set("zwtable-enabled", false);
await fire("dnd5e.applyDamage", aliceActor, 7, {});
await redraw();
check("the disabled setting suppresses everything",
    posted.length === 0 && emitted.length === 0, { posted, emitted });

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
