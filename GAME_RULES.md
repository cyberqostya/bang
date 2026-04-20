# Bang Helper Rules

Use this file as project memory for future chats. Read it first, then inspect the relevant code before changing rules.

## Architecture

- Cards and deck: `server/cards.js`.
- Authoritative game rules: `server/gameServer.js`.
- Client store and WebSocket actions: `src/stores/roomStore.js`.
- Main game screen: `src/screens/GameScreen.vue`.
- Player table, statuses, target selection: `src/components/GamePlayersTable.vue`.
- Hand: `src/components/BottomPanel.vue`.
- Permanent cards: `src/components/BlueCardsSlot.vue`.
- Event rendering: `src/components/GameEventMessage.vue`.

Checks:

```bash
node --check server/cards.js
node --check server/gameServer.js
npm run build
```

`npm run build` can fail in the sandbox with `spawn EPERM`; rerun with escalation.

## Player Cards

- `hand`: cards in hand.
- `weapon`: one weapon slot.
- `blueCards`: permanent cards on the player's table.

Own blue cards appear in `Постоянные карты`. They use the same card component and animations as `Рука`.
Newest permanent cards are inserted at the left, same as newly drawn hand cards.

## Permanent Blue Cards

Self-played:

- `Прицел`: `As`; status `scope.webp`; opponents are distance 1 closer to the owner, minimum distance remains 1; range status gets `+1`.
- `Мустанг`: `8h`, `9h`; status `mustang.webp`; opponents see the owner at distance 1 farther.
- `Бочка`: `Ks`, `Qs`; status `barrel.webp`; can be checked during `БЭНГ`/`Гатлинг` reactions.

Targeted:

- `Тюрьма`: `4h`, `Js`, `10s`; status/card `jail.webp`; played on any opponent except the Sheriff.
- `Динамит`: `2h`; status/card `dynamite.webp`; played on an opponent; only one Dynamite can be in play.

Rules:

- A player cannot have two copies of the same permanent card.
- Targeted permanent cards use `action: "playBlueCardOnTarget"` and are placed in the target player's `blueCards`.
- Play event format: `Шериф/(nothing) Actor -- Card -- Target`.

## Distance

Server is authoritative in `getPlayerDistance`.

Base distance is the shortest circle distance among alive players. Then apply:

- source player's `distanceModifierFromSelf`;
- target player's `distanceModifierToSelf`;
- final minimum is 1.

Client mirrors this only for target highlighting.

## Reactions

Pending reaction state is `room.game.pendingReaction`.

Overlay text:

```text
Вы стали целью [НазваниеКарты].
До потери здоровья осталось ->
```

For the actor:

```text
Ожидание реакции жертвы/жертв на [НазваниеКарты]
```

Do not show hints like "Вас могут спасти карты".

Cards that start pending reactions should add `previewCard` to the chat event so the card title is underlined and opens card preview. Exception: `БЭНГ` must not get this preview link.

## Barrel

During a reaction to `БЭНГ` or `Гатлинг`, a target with `Бочка` can tap it.

- Draw one check card.
- The check card goes to discard.
- Hearts: hit is canceled, event says `Бочка спасла`.
- Other suit: event says `Проверка бочки провал`; reaction remains active.
- A barrel can be checked once per pending reaction.
- Failed barrel checks store the same check payload in `pendingReaction.barrelChecks` that is used by the public chat event; the reaction notice renders from that payload.

Check event format:

```text
Шериф/Actor -- Проверка Card -- УСПЕХ/ПРОВАЛ -- вытянул карту "DrawnCard-RankSuit" -- consequence
```

`Card` uses the checked permanent card event color. `DrawnCard` and `Rank` use the drawn suit color; `Suit` is the small suit image.

## Start-Of-Turn Checks

Some permanent cards block the current player's turn until tapped in `Постоянные карты`.

State: `room.game.turnCheck`.

While `turnCheck.playerId` is the current player:

- draw phase is blocked;
- play phase is blocked;
- discard/end turn is blocked;
- weapon properties are blocked;
- hand cards cannot be played.

Priority:

1. `Динамит`
2. `Тюрьма`

`Тюрьма`:

- Draw one check card.
- Discard the check card and the Jail.
- Hearts: event says `вышел из тюрьмы`, player continues.
- Other suit: event says `пропускает ход из-за тюрьмы`, player skips the turn.
- When Jail skips the turn, the client returns the player to the common table view.
- Jail check results show a 5 second local notice to the checked player using the same rendered event text as the public chat.

`Динамит`:

- Draw one check card.
- Discard the check card.
- Spades 2 through 9: event says `БАБААААХ -- -3HP`.
- If victim has exactly 3 health, start a `dynamite` pending reaction so `ПИВО` can save them.
- Otherwise apply 3 health loss immediately.
- Dynamite check results show a 5 second local notice to the checked player when no death dialog or `ПИВО` reaction overlay takes over.
- If it does not explode, pass Dynamite clockwise to the next alive player.
- Dynamite stores `ownerPlayerId`; if it kills an outlaw, the owner can receive the existing bounty if alive.

## Statuses

Statuses are shown around players in `GamePlayersTable.vue`.

- Health and range keep their occupied positions.
- Permanent statuses fill the remaining arc positions and collapse when removed.
- Current arc step: `STATUS_ARC_STEP_DEGREES = 30`.
- Keep statuses on the same radius; change angle step for density.

Turn light uses real DOM geometry of `.game-seat__statuses` to point to the current player.
