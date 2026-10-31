# City Life Online - handoff (showroom build)

Done and tested over a real websocket session (enter gallery, buy car, ownership saved, passenger join and auto-drop):
- Elite Auto Gallery (door 32,108.5; interior room at x=1000,z=-200) with all 15 vehicles inside, price/spec card, BUY.
- Closer third-person camera.
- Naira price list in server.js VEHICLES (ids 12 Chiron, 13 Dominus GT, 14 Classic Coupe).
- Shared delivery lot in front of the gallery: everyone sees everyone's owned cars (server sends `bay`).
- Passengers: JOIN <name>'S CAR button near a friend's car, up to 3 riders, GET OUT button. Server: ridejoin/ridestop.
- Quick-chat button (speech bubble icon) with greetings, works while riding.
- Phone > Cars is now a marketplace: search, category chips, sort, In stock tags.
- Interiors resized: roomFit() applies vertical scale IK=0.78 to bank, mall, houses, gallery (T.set + makeRoom H).
- Economy: START nepo 50M / lapo 1.5M, INCOME_MULT=25 on delivery and shift pay.

NOT visually tested (no browser in the sandbox): car facing/scale, showroom layout, interior proportions, lot overlap.
NOT done: realistic human models/NPC animation, clothing shop, other enterable company interiors, buildings.js interiors are not rendered by the client.
