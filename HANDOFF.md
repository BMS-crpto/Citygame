# City Life Online - handoff

## Done (tested over a real websocket session and in a headless browser)
- Elite Auto Gallery (door 32,108.5; interior room at x=1000,z=-200) with all 15 vehicles inside, price/spec card, BUY.
- Shared delivery lot in front of the gallery, passengers (JOIN <name>'S CAR, up to 3 riders, GET OUT), quick-chat button.
- Phone > Cars marketplace: search, category chips, sort, In stock tags.
- Interiors resized: roomFit() applies vertical scale IK=0.78 to bank, mall, houses, gallery.
- Economy: START nepo 50M / lapo 1.5M, INCOME_MULT=25 on delivery and shift pay. Nepo "empire" mission goal is now 250M (5x start).
- **Every building in `public/buildings.js` is now enterable** (367 of them): door canopy + name sign, interior built on demand
  (`buildVenueInside` in index.html) with furniture, an owner NPC and a glowing activity spot that triggers the server's `venue` action.
  Types: restaurant, club, pharmacy, supermarket, gym, church, salon, office, tower, hotel, home, market, terminal.
- Repo cleanup: removed server-2..5.js and junk readmes, package.json has no dependencies, README.md rewritten.

## Not done
- Realistic human models / NPC animation, clothing shop.
- Browser-tested only with software WebGL: restaurant, club, office, church, market. Pharmacy, supermarket, gym, salon, tower,
  hotel, home and terminal furniture is built the same way but not yet looked at; check proportions and that nothing blocks the door.
- Several .glb files in public/models are not referenced by the client (beach, bikerack, highway, stage, stalls, rifle, soldier,
  businessman, tshirt, phone, dumpster, dominus, bmw_m4...). bmw_m4_competition_m_package.glb alone is 22 MB. Remove if unused.
- Client loads Three.js r128 and Google Fonts from CDNs.
