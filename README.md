# zwtable-foundry

A Foundry VTT module that drives the LEDs in the Zerowhale gaming table from what is
happening in the game.

## What it does

Each player is assigned to one of the table's six light positions. Every seated player's
position is lit, so the table is a party status board at a glance -- the active seat at full
brightness, the seat whose turn is next dimmer, the rest dimmer still.

### States

Exactly one state applies to a character at a time. They are listed most significant first, and
that order is the precedence.

| State | Effect |
| --- | --- |
| Dead | Dim grey |
| Dying (0 hp) | Slow red throb, with death save progress at either end of the strip |
| Unconscious | Dim grey-blue |
| Charmed | Rainbow |
| Bloodied | Red alternating with the player's colour |
| Normal | Solid, in the player's colour |

### Overlays

Overlays sit above the state without replacing it, on a few pixels at one end of the strip.

| Overlay | Effect |
| --- | --- |
| Concentration | Cyan pulse at the far end of the strip |
| Death save successes | Up to three green pips at the near end |
| Death save failures | Up to three red pips at the far end |
| Turn over time | Amber pulse across the seat, once a turn has run longer than the configured limit |

### Events

Events flash briefly above everything and expire on their own.

| Event | Effect |
| --- | --- |
| Damage | Red flash, longer and faster the more of the character's health it took |
| Healing | Green flash |
| Critical hit | Fast gold flash |
| Fumble | Two slow dark red flashes |
| Death save | White on a success, red on a failure |
| Rest finished | A wave of warm light travelling around the table |
| Targeted | A single white blink (off by default) |

Outside combat, rolling initiative lights each player's position as they roll, and the active
Foundry scene can run a stored table scene for ambient lighting.

## Requirements

- Foundry VTT v12 or later (verified against v14.364).
- The `dnd5e` system, for the damage/healing flash and the bloodied status.
- A reachable [Zerowhale table server](https://github.com/tlgkccampbell/zwtable). Pixel ranges,
  remove-by-name and the slowed crawl are all needed by the effects above, so the server has to
  be built from a commit that has them.

## Setup

Configure the module under *Game Settings → Configure Settings → Zerowhale Table Integration*:

- **Table Enabled** — master switch for the integration.
- **Table API Base URL** — e.g. `http://zwtable.local/`. **Only the GM's browser needs to be
  able to reach this address** (see below).
- **Player at Table Position 0–5** — which Foundry user sits at each light position.
- **Idle Seat Brightness** — how brightly to light seats whose turn it is not, as a percentage.
  At 0 only the active combatant is lit, which is how the table behaved before this was added.
- **Turn Timer** — seconds before the active seat starts pulsing amber. 0 turns it off.
- One switch per effect, so anything that turns out to be a distraction can be turned off.
  Targeting is off by default; it fires often enough at a busy table to be noise.
- **Debug Logging** — per-client; logs every command and relay to the browser console.

### Scene lighting

A Foundry scene can name a scene stored on the table server, which the table runs whenever that
Foundry scene is activated and no combat is running. Set it from a GM console while viewing the
scene:

```js
zwtablescene("tavern")   // clear it again with zwtablescene("")
```

The table scene has to exist on the server already; create one with `POST /api/scenes`.

## How commands reach the table

Foundry hooks fire on *every* connected client, so the module nominates a single client — the
active GM — to talk to the table server. Every other client stays quiet, or relays its events
to the GM over the module's socket when the triggering hook only fires locally (for example,
`dnd5e.applyDamage`, which fires only on the client that applied the damage).

This means:

- Players' actions reach the table even though only the GM's browser can see the table server.
- The table receives exactly one copy of each command, rather than one per connected client.
- If no GM is logged in, the table is not updated.

## Command stack conventions

The table server gives each light position a stack of commands, composed bottom-up, with each
command painting into its own range of pixels. The module uses two reserved slot names:

- **`base`** — full width, written with `replaceOrSet`, never expires. Exactly one per
  position, holding that seat's resolved state.
- **`accent`** — the last few pixels, written with `replaceOrPush`, never expires. A secondary
  indicator that coexists with `base`. It must not use `replaceOrSet`: with no accent yet on the
  stack that falls back to `set`, which clears the stack and takes `base` with it.

Everything else is an anonymous `push` with `expirationTime` always set, so transient effects
(such as the damage flash) self-expire and reveal the `base` beneath them. See
`Documentation/command-stack.md` in the table server repository.

Pixel ranges need a table server built after the compositing change. Against an older server
the range parameters are ignored, so an `accent` would cover the whole strip instead of its
last few pixels.

## Development

`npm test` runs the module's smoke tests against a small mock of the Foundry globals. They
cover the part that cannot be checked by reading the code: which client ends up talking to the
table. Foundry fires most hooks on every connected client, and exactly one of them may send a
command.

To see what the module is actually doing to the lights without the table present, start the
table server with `dotnet run --launch-profile simulated` and open its root page, which renders
every strip live. `package.json` and `test/` are tooling only; Foundry loads what `module.json` declares.

## Console helpers

Available to GMs as globals, and to any client via `game.modules.get("zwtable-foundry").api`:

```js
zwtablestatus()               // query the controller boards
zwtablereset()                // clear every position
zwtablerefresh()              // redraw the table from the current world state
zwtabletest(0)                // light position 0 white
zwtablecmd([...])             // send a raw command batch
zwtablescene("tavern")        // point the current Foundry scene at a table scene
```
