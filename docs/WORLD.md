# Farway: world bible v2

Built from the owner's answers to a planning questionnaire (2026-11-04 to 2026-11-06), then checked against this repo at commit 6c4bcb1.

Every line carries a tag.

- **[SETTLED]** the owner said it.
- **[BUILT]** verified in this repo, and a test covers it.
- **[MY CALL]** proposed by the planning assistant where the owner said "you decide" or left it open. Not confirmed; the owner may veto it.
- **[OPEN]** needs a decision from the owner.

---

## 1. Premise

- Farway is the generated world. Project Never Land runs it. A supercomputer in Secret Operations generated it and controls everything. [SETTLED]
- The world is an allegory for being taken. "Far Away" means taken, Never Land echoes the ranch, and being "noclipped" means being abducted. The Backrooms resonates because it is hard to accept how many people go missing, so it works as a quiet answer to a scarier real world. [SETTLED]
- The allegory lives in the mechanics. [MY CALL]
  - The lure is a job application: the drag-and-drop quiz, for the Intern and every other job.
  - Isolation is the empty city and the one apartment.
  - Surveillance is the cameras and the agents.
  - Confinement is the cell.
  - Control is the keycards and access levels.
  - The player's base weapon is the Error Deletion Ray, which no-clips a monster to another place. That is the same act as taking a person. Admin's red version, renamed "ATL X", deletes.
  - The game's own title, "Look Over There", is the abductor's distraction line.
- Guardrails. [MY CALL]
  - No real names, cases or victims in the game.
  - Nothing graphic.
  - Show the machinery of taking people, never the harm.
  - Consider a short content note on first launch.
- The Neverland ranch is a real place. Keep "Never Land" generic in-game, with no direct reference.
- Different truths per area. [OPEN] Proposals are in section 9.

## 2. Tone: how to tell the three apart [SETTLED]

| Mode | Feels like | Where |
|---|---|---|
| Dreamcore | Happy and dreamlike, but fake | Overworld, the dreamcore forest and house, playground, tree house |
| Liminal | Off and empty but seemingly normal | City, hotel upper floors, mall, grocery |
| Backrooms | A mix of both, but hostile and stripped of navigability, built to disorient | Look Over There floors and chambers, the atrium anomaly maze, Secret Operations |

- The Overworld is plastic, like a simulation, and eerily beautiful.
- It has four skies: clear with no clouds, drifting anime clouds, sunrise and sunset, and a bright starry night. A game day is 15 real minutes.
- Film grain and a VHS look, both. Voice and text, both. Each game keeps its own walker scale, because it adds to the liminal oddness.

## 3. The map

```
FARWAY
|
OVERWORLD (hub, 10 minutes end to end)
|  table and chairs (spawn), Market, groundskeepers, playground (mini-games for money),
|  tree house, parking lot, Look Over There store, endless hills with physics toys,
|  fake 2D horizon, "more to come" facades
|
+-- LOOK OVER THERE doors ----> options: [Original] or [Going back in]
|        Original: B1 > L1 > L2 > L3 > L4, then walk out onto the parking lot
|        Going back in: top down L4 > L3 > L2 > L1 > B1, 4 chambers a floor, 20 waves
|
+-- bus station (just a ride) --> CITY
|        Hallam Row (jobs), apartment tower = HOTEL, mall, grocery
|
+-- road > forest > meadow with SHED > DREAMCORE HOUSE (Right Door, Wrong Exit, ~50 rooms)
|        shed and tree house lead to their own addons later
|
SECRET OPERATIONS (Project Never Land): hidden no-clearance entrance deep in the Right Door,
Wrong Exit maze, keycard doors everywhere else, hardest boss (The Registrar), Admin access
```

### Connector types you named [SETTLED]

| Connector | Used for |
|---|---|
| Stair door with lit hallway (built) | Look Over There floors |
| Painted-sky hall with an EXIT door | Every hall between worlds |
| Elevator (reused from the Intern) | Hotel floors; the apartment to every level |
| Service corridors and lifts | The hidden network; Intern, grocery back-of-house, Look Over There backstage |
| Bus ride | Overworld to city |
| Pool dive | Intern escape to Secret Operations; hotel sub-floor pools to B1 pools (a long way) |
| Vent crawl, stairs, door | Chamber to chamber in Going back in (all mixed) |
| Gate (built) | Overworld to games. Today the gates to Right Door, Wrong Exit and the Intern are solo only. |

## 4. Places

### Overworld [SETTLED unless tagged]
- Walking out of Look Over There onto the parking lot ends the Original. The results screen already shows place, time and your best time on this browser. [BUILT] Still to add: deaths, an online ranking, a congratulations and a welcome to Farway. [SETTLED]
- A first-time player sees the whole Overworld at once, and new facades appear as things are added.
- The Market sells weapons, gear, food, keycards and cosmetics. It is also where lost ammo, consumables and perks are bought back (section 5).
- Groundskeepers maintain the hedges. They watch you or ignore you.
- The endless hills never get you further away. They hold little puzzles and toys you can kick around, with physics.
- The edge of the world is a fake 2D render of more world that looks real.
- You land back at the door you left after any game.
- The playground has real playground equipment, each a mini-game that pays money (section 5).

### Dreamcore forest and house [SETTLED]
- Road, then forest, then a meadow with the shed, then the house. The shed is in the forest, not in the Overworld.
- The shed is an entrance and a puzzle. The tree house is a puzzle and an entrance. Both lead to their own addons later.
- The house is much bigger inside.

### Look Over There [SETTLED unless tagged]

**Original (built).** A co-op round for 2 to 8 players, about 20 minutes, solo allowed. [BUILT]
- You climb B1, L1, L2, L3, L4 together and get out. One puzzle gates each floor.

| Floor | Puzzle |
|---|---|
| B1 pools | Three fuses, carried one at a time to the stair door |
| L1 offices | Two far-apart switches, each flip is loud and draws monsters |
| L2 | A 4-digit code, one digit on each of four notes the team finds |
| L3 white room | No monsters. An optional fuse box powers L4's doors early. |
| L4 showroom | The glass doors are shut unless the power is on. Then a 60-second alarm hunt, then out onto the parking lot. |

- Survival: crouch is quiet and halves how far monsters see you, but you cannot outrun them, so you hide and use doors. Doors can be closed, and a door you shut is shut for everyone.
- Health: 100 HP, 35 per monster hit. In a room you are downed, not dead: teammates revive you in 4 seconds, and you wake at the stairs after 45 seconds. Solo: die, wait 3 seconds, respawn at a random spot.
- Monsters are server-run: Sinew of the Abyss on B1, the Pale Traveler on L1, the clawed creature on L2, the first creature on L4, none on L3. Monster count scaling by player count is planned.
- Cameras sweep each floor, and monsters show on the team map only when a camera sees them.
- Five playable characters: plaid, suit, shorts, red, white. The suit is the agent model for Secret Operations. [SETTLED]
- The owner's own solo run took 36 minutes with about 23 downs on B1, so the numbers are untuned. [BUILT note]

**The base kit (built).** Three items, all non-lethal. [BUILT]

| Item | Primary | Secondary |
|---|---|---|
| Error Deletion Ray (the "noclipper") | Fires a ray that no-clips a monster to another place at least 15 m away and out of sight; it flickers, waits 4 seconds, then patrols again. A shot is as loud as running. 3 starting rounds, 9 max. | Aim and zoom |
| Cloak | Monsters cannot see you beyond 1.5 m but still hear you. About 15 seconds of use, 45 to recharge. | Short circuit: stuns every monster within 8 m for 5 seconds, then the cloak is dead for 5 minutes |
| AFK Beacon | Roll it up to 12 m. For 25 seconds monsters within 30 m go and idle around it. | Reverse: monsters run from it for 12 seconds, then group up round it. Once per beacon. |

- Controls: Y takes out the gun, cloak or beacon (tap rotates, hold opens a wheel). Shift or left-stick click crouches (toggle). R or right-stick click runs (hold). RT or left click uses what you hold. LT or right click aims the gun. X is action.
- Q and E (LB and RB on a controller) are consumable slots, empty today. That is where the arsenal's consumables and the dealer items will go.
- Loot today: B1 has 8 lockers, each holding one ray and one cloak, taken once. Ammo packs lie on every floor (3 rounds each). Two beacons per floor.
- The existing locker is a one-time pickup. The Going back in locker is a loadout station. They need different names. [OPEN]

**Going back in.** [SETTLED]
- A 20-wave run: 5 floors, 4 chambers each, top down: L4, L3, L2, L1, B1. A chamber is as big as an original floor, and the 4th always has the stairs down.
- Version 1 is 4 chambers per floor with no randomness yet. The existing floor is one of the four, so that is 15 new chambers.
- Each chamber has one wave, triggered on entering. The rest is quiet time: find objects, puzzles, loot, build defences, explore.
- A chamber is cleared by all of these: missing objects, puzzles, kill count, surviving a timer.
- Chambers connect with any mix of vent crawls, elevators, stairs, doors and painted-sky halls.
- Unkillable threats: crushing walls, floor is lava, high tides, toxic gas, moving chainsaw blades. Special entities come later.
- Soft pressure: light, battery, a noise meter, hunger.
- Doors can be closed, trapped or barricaded. Doors only.
- You can crawl into vents. Monsters never use them.
- Safe houses on every floor hold a shop, stash, save, crafting and a respawn point.
- Lockers sit one per safe house and one per chamber. They show your loadout, let you change it, and return your gear for free after you die.
- Money comes from clearing chambers and from every kill and revive. Level comes from achievements.
- Own save, with money and items shared. Online leaderboard per run, plus personal and overall bests.
- Lethal weapons are bought at the Market. The arsenal is in section 5.

### City [SETTLED unless tagged]
- Open streets plus interiors. 15 real minutes a day. Needs: hunger and sleep. Food comes from the grocery by cart and checkout. A bed saves and skips the night.
- At night stores close. There is a grace period until midnight, then everything turns dangerous. Unkillable monsters come out and you must get to your apartment. The mall can lock you in.
- The stalker is the city's creature. It never touches you while you look at it. If you ignore it too long while alone, it grabs you and bites your head off. It is the only monster that follows between areas.
- Threats are separate: stalker, agents, cell (a puzzle escape), death. You can also get into trouble by stealing or being seen on camera in a restricted area. Anomalies are both spot-and-report and avoid.
- NPCs: mannequin-like figures and people with routines. The lit windows are a mix of decoration, NPC apartments, apartments you can visit and things watching you.
- Apartment computer: job search, mini-games, mail, news, bank, map.
- Applications are a drag-and-drop quiz. Answer wrong and you are rejected, answer right and you are accepted. One application at a time.
- The player is whoever they choose. Customisable: name, face and body, clothes, starting gear. The Intern and every other role are jobs the player takes.

**Hallam Row, the jobs street.** The Intern's company is already at 666 Hallam Row in the game. [BUILT] The other addresses are a proposal. [MY CALL]

| Address | Job | Notes |
|---|---|---|
| 41 Hallam Row | Trash truck worker | Municipal sanitation depot. The job is on the street, along a route. |
| 108 Hallam Row | Museum night guard | A small museum where everything comes alive at night. |
| 214 Hallam Row | Laboratory worker | The nearest job to Secret Operations. |
| 330 Hallam Row | Factory floor worker | |
| 666 Hallam Row | The Intern | The last number on the street. |

- The numbers climb as the jobs get stranger, and new jobs fill in between. The street gets longer as you unlock addons.
- Pay scales with performance. Job games are their own addons, mixed with the Intern's engine and chamber tech.

### Hotel tower [SETTLED unless tagged]
- It is the apartment tower. Order from the bottom: sub-floor pools, lobby, floor 1 (motel), floor 2 (green carpet), floor 3 (apartments), roof.
- Entry: street, lobby front, a back door past the deli area under the loft, a narrow hall into the atrium. The atrium is the hub. Each floor has its own section of the atrium and you move between floors by elevator.
- Floors 1 and 2: 20 openable doors each, two levels joined by a staircase, each level a scene, rooms loaded in when opened. A Hello Neighbor style game. The neighbor is a hotel resident and the stalker. It guards a secret about the hotel.
- Floor 3: 10 doors on one level. Peaceful. Every player gets an apartment, and up to 10 players share the floor. The others hold other players, clues, empty rooms. The roof is the upper level: city skyline, a puzzle and a safe house.
- Sub floor: 11 separate pool scenes, peaceful with puzzles. Connected underwater to B1's pools but separate pools, and you must beat many levels to travel between.
- Lobby: peaceful, a hub with shops. Shady dealers sell items that change gameplay (section 5). It also has puzzles.
- Atrium anomaly maze: separate scenes off the atrium, one-way routes, you leave only by solving. Photos: IMG_2988, 2989, 2990, 2910, 2986, 3015, 3036. The elevator can glitch you into it.
- Facade doors that do not open are places for future features.
- Photos assigned: floor 1 corridor IMG_2999, Room 1 and Room 2 are two rooms, floor 2 dining IMG_2903 and reception IMG_2984 are hand-built key rooms, IMG_2985 is a hand-built key room and PNG image is a redesign of it. The escalators and the other staircase are separate places.

### Mall [SETTLED]
- Old and abandoned, and also being built. Nobody visible, scaffolding only. Themed wings: bookstore, cinema, entertainment.
- Shops you can enter: the bookstore, its front desk and the cinema lobby.
- IMG_2909 and IMG_3012 are scenes. The other painted-sky spaces are hall connectors. IMG_2991 and IMG_3014 are one scene. IMG_3008 and IMG_3010 are one scene.
- Mannequins are monster, set dressing and NPCs. The mirror bathroom is a portal and a puzzle.

### Grocery [SETTLED]
- Open by day and abandoned by night. Three scenes, plus basement, back-of-house, staff areas, more aisles, a second floor. It is the same room as the end of Right Door, Wrong Exit and a bigger version. The red-cart clearing is IMG_3027.
- The back-of-house door to Secret Operations is a staff door, a freight lift and a keycard reader.

### Right Door, Wrong Exit [SETTLED]
- About 50 rooms. Rooms are remade larger and psychedelic. Super Liminal style: object distortion, perspective shifting, off-looking objects, distorted halls, multi-choice navigation, psychological puzzles, environmental storytelling. Room mini-games also become gates. Every door is different, with fixed exits.
- The notebook is a graph of connections, not of space.
- No true exit. Each completed room builds to a finale: the map opens into hide and seek. You win by hacking the computers to turn off the cameras. A swarm of secret agents arrives late. After beating it, you can play with friends.
- One ending, many exits.
- Hidden Secret Operations entrance: a room that repeats, or a door visible from one angle.

### Secret Operations (Project Never Land) [SETTLED unless tagged]
- A shooter. Fight the bad guys, destroy the base. It reuses and reskins Look Over There with weapons and gear carrying over. Agents are the suit character.
- Entrances: one hidden with no clearance, the rest need a keycard. Keycards are tiered by progress and very expensive at the Market.
- Admin access: noclip, spawn items, teleport, delete players and monsters. Unlocked by beating the hardest boss. The game does not end.
- The control room with a single chair in a cell: you are watched if caught.
- Sections before the boss are open-ended.

**The boss: The Registrar.** [MY CALL] The supercomputer that generated the world, in the green zone with the pink stripe.
- It runs on the world's own rules, turned on you. It sees through cameras, files people, and no-clips them away.
- Arena: a long green server hall with the pink stripe on the walls, the control room and cell at one end, cameras on every wall.
- Phase 1, Intake. Cameras and agents. You cut the breakers and smash cameras to blind it. Damaged cameras can hurt you.
- Phase 2, Processing. It "files" players: it no-clips each player to a random place in the base. You have to get back, and the cell is a puzzle room you must solve to leave.
- Phase 3, Release. The arena's sky and geometry glitch, like the four Overworld skies failing. You fire at the server racks while it deletes the floor under you.
- Win: its core is destroyed and you gain Admin access. Farway keeps running, but the world now answers to you.

## 5. Systems

**Money.** Job pay by performance, chests and piggy banks in Right Door, Wrong Exit, chamber clears, kills and revives. Level is based on how much of the game you have beaten, marked by achievements.

**Death in Going back in.** [SETTLED]
- The locker returns your weapons and gear for free: the ray, cloak, beacon and your arsenal loadout.
- It does not return ammo, consumables or perks. You buy those back at the Market or a safe house.
- Starting prices (numbers to tune): ammo cheap, consumables mid, perks expensive. [MY CALL]

**Master arsenal (10 weapons, 3 consumables).** Pneumatic bolt driver, hunting crossbow, propane flamethrower, stun-baton capacitor, almond water aerosol rocket launcher, optical laser pointer dissector, hydraulic rebar shear, sound-amplified frequency horn, moth jelly dart, spring-loaded gravity gauntlet. Consumables: almond water land mine, compressed-air nail-bomb tripwire, phosphor-core incendiary flash-vial. These all need their own ammo rules, since today only the ray has rounds. Several names come from Backrooms community lore (almond water, deathmoths). That wiki is believed to be CC BY-SA, so attribute it if any text is lifted.

**Dealer items (fictional names from the start, effects everywhere).** The downsides were accepted by the owner ("use those"). Durations are starting numbers. [MY CALL]

| Item | Effect | Downside | Duration |
|---|---|---|---|
| Green plant | Slower, hungrier, all enemies become passive, 64-bit waving filter | Slowness and hunger | 5 min |
| Paper tab | Fast, mushroom effects, plus the wave filter | A longer, harsher crash | 5 min, then a 2 min crash |
| Mushrooms | A wavy, weirder world, in a good way | Unreliable depth: jumps and throws land off target | 3 min |
| White powder | Faster and stronger | A crash afterwards: slower, weaker, louder, as long as the boost | 60 s boost, 60 s crash |
| Alcohol | Funny walk and run, wobble grows with each drink, 5% less damage per bottle | Blackout at 5 drinks for 15 s, impossible to aim stably | per drink |

**Playground mini-games.** Each pays money by performance and doubles as a physics test. The list is an expansion of the owner's "real playground". [MY CALL]

| Equipment | Mini-game |
|---|---|
| Swing | Pump with good timing to reach the highest arc, then jump off at the peak for distance. |
| Slide | Steer a fast line down, picking up coins, fastest time wins. |
| Seesaw | Keep the plank level for 30 seconds with a partner or a groundskeeper. |
| Merry-go-round | Stay on as it spins faster. |
| Monkey bars | A stamina traverse. |
| Sandbox | Dig for coins against a timer. |
| Spring riders | Bounce onto targets. |
| Climbing frame | Climb a route to a prize. |

**Physics.** Kickable balls and toys, pushable furniture, throwable items, dropped loot, doors and barricades, water. Not ragdoll monsters. Applies everywhere. The playground is the best first test.

**Monsters.** Every monster has a custom kill animation, and the number of hits to kill you differs by monster. After a kill: depends on the monster, fade to a random respawn spot, a stats screen, a short replay.

**Cameras.** A sighting sends agents and sounds an alarm in that area, only in restricted areas. Cut the breaker or smash cameras: they stay damaged until fixed, and this can hurt players. Agents are killable.

**Co-op.** Parties group by game so friends can join whenever, like Roblox's multi-lobby system. Hide and seek with friends: either side seeks.
- Built: rooms of up to 8 on a Node server, with the monsters simulated on the server at 20 Hz. [BUILT]
- You asked for lobbies up to 10 and for co-op everywhere. Today the room cap is 8, and the gates to Right Door, Wrong Exit and the Intern are solo only. [OPEN]

**Accounts and saves.** Account-based. Checkpoints plus beds and safe houses. Achievements plus a found-things list. Online leaderboard. None of this exists yet. The best time is stored per browser.

## 6. Scene budget (rough)

| Area | Hand-built | Templated or reused |
|---|---|---|
| Overworld and forest | about 6 | |
| Look Over There original floors | 5 (exist) | |
| Going back in, version 1 | 15 new chambers | 5 existing floors |
| Right Door, Wrong Exit | about 43 new rooms | 7 exist |
| Hotel | about 35 scenes | 50 rooms from a handful of layouts |
| Mall | about 18 scenes | connectors |
| Grocery | about 5 scenes | |
| Secret Operations | about 12 scenes plus boss | reskinned chambers |
| Job addons | 4 to 5 games | |

This is on the order of 150 hand-built spaces. The photos are all AI-generated, so they are references to recreate. Use them as textures only after checking the generator's terms.

## 7. Technology and plan

- **Corrected from v1:** there is already a backend. A Node server (`server/server.js`, a Dockerfile, deployed to Railway) runs rooms of up to 8. It simulates the monsters per floor at 20 Hz, owns each player's HP, rounds and downs, and has message rate limits. The rules are shared with solo play in `shared/`. [BUILT]
- **What the server lacks for the plan:**
  - accounts and saves;
  - an online leaderboard (best time is per browser);
  - parties by game and lobbies up to 10;
  - gates and addons inside rooms.
- **The key integration point.** The server accepts only the five floors (`FLOORS` in `shared/world.js`, plus the puzzle and loot tables). New scenes, chambers and addons must be added there, so the manifest must drive that list or every addon needs a server change.
- **Unverified:** a real controller, the live site after the merge, Safari, and the speeds. The unit tests pass; the browser flows were not all driven.
- The owner's stated order: connection system and shared save, then the physics decision, then the Overworld from the existing exterior, then the options screen and safe houses, with a world manifest soon. Overworld, city, manifest and physics come before the hotel, mall, grocery, Going back in and Secret Operations. [SETTLED]
- Weeks to months, no time limit, you and me, one repo. [SETTLED]
- Addons are folders in one repo, loaded on demand through the manifest. [SETTLED]
- A small editor for doors, spawn points and links. [SETTLED]

## 8. Version 0 [MY CALL]

The smallest version where the world feels real:
- Finish Look Over There, walk out onto the parking lot, and get the results with deaths and the welcome to Farway.
- The Overworld with the table, store, parking lot, one sky mode and the road to the forest.
- A bus to one short city street with the apartment, the Intern's job at 666 Hallam Row, the grocery and the night rule.
- Everything else as a facade, reserved in the manifest.

## 9. Proposals for what you left open [MY CALL]

- Three city anomalies: a shop sign that changes one letter each time you pass; pedestrians that all face the same direction; a lit window in a building that is not there.
- Intern application questions: sort tasks, match a form to a day, then slowly more intrusive ones (who knows where you are, who would notice if you were gone).
- Secret Operations reskin: all five floors' chamber pools plus unique lab and corridor sections.
- Off limits: real names and cases, graphic harm, real-money gambling, committing keys, and changing the original floors' collision data without the tests.
- Lore: the Overworld is the holding area, a safe-looking world that makes the taken feel fine. Red means flagged by the system. The hum is the servers. The final secret is that the player was taken too.

## 10. Still open

1. Room cap: 8 today, 10 in the plan. Co-op inside the games: gates are solo only today.
2. Name for the Going back in locker, since the existing locker is a one-time pickup.
3. Ranking: deaths, an online leaderboard and accounts need a backend you have not chosen.
4. Company names for the Hallam Row jobs, if you want them.
5. Lore truths per area.
6. How the arsenal's ammo works, since only the ray has rounds today.
7. The Intern's redesign.
