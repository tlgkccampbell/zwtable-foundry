# zwtable-foundry

A Foundry VTT module that drives the LEDs in the Zerowhale gaming table from what is
happening in the game.

## What it does

Each player is assigned to one of the table's six light positions. During combat the table
clears and lights the position of whoever's turn it is, in that player's Foundry colour, and
reflects their character's state:

| State | Effect |
| --- | --- |
| Normal | Solid, in the player's colour |
| Bloodied | Alternating red and the player's colour |
| Charmed | Rainbow |
| Damage taken | Red flash |
| Healing received | Green flash |

Outside of combat, rolling initiative lights each player's position as they roll.

## Requirements

- Foundry VTT v12 or later (verified against v14.364).
- The `dnd5e` system, for the damage/healing flash and the bloodied status.
- A reachable [Zerowhale table server](https://github.com/tlgkccampbell/zwtable).

## Setup

Configure the module under *Game Settings → Configure Settings → Zerowhale Table Integration*:

- **Table Enabled** — master switch for the integration.
- **Table API Base URL** — e.g. `http://zwtable.local/`. **Only the GM's browser needs to be
  able to reach this address** (see below).
- **Player at Table Position 0–5** — which Foundry user sits at each light position.
- **Debug Logging** — per-client; logs every command and relay to the browser console.

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
zwtabletest(0)                // light position 0 white
zwtablecmd([...])             // send a raw command batch
```
