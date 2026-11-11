/* Wendy's weekend in Williamsburg, November 21–22 2026. Loaded after
   ../places.js, whose Manhattan places ride along as `far` — off the map until
   "Include Manhattan" is pressed. nyc.js reads everything from PAGE. */
const W_HOTEL = {
  id:'hotel', kind:'hotel', name:'Pod Brooklyn', label:'Your hotel',
  sub:'247 Metropolitan Ave · Williamsburg', lat:40.71528, lon:-73.95881,
  url:'https://www.thepodhotel.com/pod-bk', img:'img/pod.webp',
  about:'Home base, right in the middle of Williamsburg. Every walking time on this map is measured from the front door. The L train at Bedford Avenue, four blocks away, is one stop from Manhattan.'
};
const W_SHOW = {
  id:'show', kind:'show', name:'Rising Appalachia', label:'Your show · Sun 7:30',
  sub:'National Sawdust · 80 N 6th St', lat:40.71896, lon:-73.96124,
  url:'https://www.nationalsawdust.org/event/lpr-presents-rising-appalachia', img:'img/risingapp.webp',
  about:'Sunday, November 22. Doors open at 6:30 PM and the music starts at 7:30. National Sawdust is a small, beautiful hall and this show is standing room, so wear comfortable shoes. It is an easy walk from the hotel — and Cafe Mogador is around the corner for dinner first.'
};
const W_SEE = [
  {id:'domino', name:'Domino Park', sub:'Waterfront park · Kent Ave at S 2nd St', lat:40.7141, lon:-73.9683, url:'https://www.dominopark.com/', img:'img/domino.webp',
   about:'A riverside park built around the old Domino Sugar factory, with a raised walkway and a wide-open view of the Manhattan skyline and the Williamsburg Bridge. Free, flat, and lovely at sunset.'},
  {id:'mpj', name:'Marsha P. Johnson State Park', sub:'Waterfront lawn · Kent Ave at N 8th St', lat:40.7218, lon:-73.9622, url:'https://parks.ny.gov/parks/marshapjohnson', img:'img/mpj.webp',
   about:'A quiet stretch of grass and old cobblestones right on the East River, looking straight across at the Empire State Building. Bring a coffee and sit a while.'},
  {id:'ferry', name:'The East River ferry', sub:'North Williamsburg landing · foot of N 6th St', lat:40.7209, lon:-73.9643, url:'https://www.ferry.nyc/', img:'img/ferry.webp',
   about:'The best cheap boat ride in New York. For about the price of a subway ride the ferry runs down the river, under the bridges, to DUMBO and Wall Street, or up to Midtown at 34th Street. Buy a ticket at the machine on the pier. Sit on the top deck if it isn’t too cold.'},
  {id:'wbridge', name:'Walk the Williamsburg Bridge', sub:'Footpath starts near Bedford Ave & S 6th St', lat:40.7103, lon:-73.9630, url:'https://www.nyc.gov/html/dot/html/infrastructure/williamsburg-bridge.shtml', img:'img/wbridge.webp',
   about:'A wide footpath runs over the bridge, high above the river, and lands in Manhattan’s Lower East Side about 30 minutes later. Far less crowded than the Brooklyn Bridge. Walk part-way for the view and turn back, or go all the way across.'},
  {id:'mccarren', name:'McCarren Park', sub:'Bedford Ave at N 12th St', lat:40.7212, lon:-73.9529, url:'https://www.nycgovparks.org/parks/mccarren-park', img:'img/mccarren.webp',
   about:'The neighbourhood’s big park, where Williamsburg meets Greenpoint. On Saturday there is a farmers’ market at the corner by Union Avenue until mid-afternoon — good for a wander and a snack.'},
  {id:'bedford', name:'Bedford Avenue', sub:'The main street · Spoonbill & Sugartown books', lat:40.7166, lon:-73.9593, url:'https://www.spoonbillbooks.com/',
   about:'Williamsburg’s main street: small shops, vintage clothes, record stores, bakeries and people-watching. The dot marks Spoonbill & Sugartown, a well-loved bookshop. Stroll north from here toward McCarren Park.'},
  {id:'fleas', name:'Artists & Fleas', sub:'Weekend makers’ market · 70 N 7th St', lat:40.7202, lon:-73.9618, url:'https://www.artistsandfleas.com/', img:'img/fleas.webp',
   about:'An indoor market open on Saturdays and Sundays, full of stalls run by local artists, jewellers and vintage dealers. Warm, browsable, and a block from where your show is.'},
  {id:'reliquary', name:'The City Reliquary', sub:'Tiny museum · 370 Metropolitan Ave', lat:40.7139, lon:-73.9554, url:'https://www.cityreliquary.org/', img:'img/reliquary.webp',
   about:'A funny, big-hearted little museum of New York odds and ends — old subway tokens, Statue of Liberty souvenirs, pieces of famous buildings. Just up the street from the hotel. Open Saturday and Sunday, noon to 6.'},
  {id:'westlight', name:'Westlight', sub:'Rooftop bar · 22nd floor, 111 N 12th St', lat:40.7223, lon:-73.9568, url:'https://www.westlightnyc.com/',
   about:'A bar on the roof of the William Vale hotel with a view over all of Manhattan and Brooklyn. Go for one drink around sunset (about 4:30 in November) — the view is the point. It is indoors with a wraparound terrace.'},
  {id:'nitehawk', name:'Nitehawk Cinema', sub:'Movies with dinner · 136 Metropolitan Ave', lat:40.7161, lon:-73.9624, url:'https://nitehawkcinema.com/williamsburg/',
   about:'A small movie theatre where food and drinks are brought to your seat during the film. A good plan if the weather turns. Five minutes from the hotel.'},
  {id:'bowl', name:'Brooklyn Bowl', sub:'Bowling and live music · 61 Wythe Ave', lat:40.7220, lon:-73.9575, url:'https://www.brooklynbowl.com/brooklyn',
   about:'Sixteen bowling lanes beside a concert stage, in an old ironworks. There is a band most nights and famously good fried chicken. Check what’s playing Saturday.'},
];
const W_EAT = [
  {id:'stanselm', pick:'A good one for Saturday night', pickwhy:'Closest to the hotel', name:'St. Anselm', sub:'Steaks off the grill · 355 Metropolitan Ave', lat:40.7143, lon:-73.9560, url:'https://www.stanselm.net/',
   about:'A small, no-fuss neighbourhood steakhouse just up the street. Everything is cooked over a wood grill, and the butcher’s steak is one of the best deals in the city. Not fancy at all. It is popular, so book ahead or go early and expect a short wait.'},
  {id:'bamontes', pick:'A good one for Saturday night', pickwhy:'Old New York, big plates', name:'Bamonte’s', sub:'Old-school Italian · 32 Withers St', lat:40.7166, lon:-73.9512, img:'img/bamontes.webp',
   about:'Red-sauce Italian the way it has been served here since 1900: baked clams, veal parmigiana, spaghetti and meatballs, waiters in bow ties. Warm, unpretentious and generous. Call ahead for a table.'},
  {id:'mogador', pick:'A good one for Saturday night', pickwhy:'Or Sunday, before the show', name:'Cafe Mogador', sub:'Moroccan · 133 Wythe Ave', lat:40.7197, lon:-73.9600, url:'https://www.cafemogador.com/', img:'img/mogador.webp',
   about:'A cosy, candle-lit Moroccan café: chicken tagines, couscous, hummus and warm bread. Friendly prices and an easy room to linger in. It is one block from National Sawdust, so it also works for an early dinner before Sunday’s show.'},
  {id:'diner', name:'Diner', sub:'American · 85 Broadway', lat:40.7107, lon:-73.9656, url:'https://www.dinernyc.com/', img:'img/diner.webp',
   about:'A real 1920s dining car under the Williamsburg Bridge. The short menu changes every day and the server writes it on your paper tablecloth; the burger is always on it. Relaxed and very Brooklyn.'},
  {id:'aurora', name:'Aurora', sub:'Rustic Italian · 70 Grand St', lat:40.7157, lon:-73.9647, url:'https://www.aurorabk.com/', img:'img/aurora.webp',
   about:'A brick-walled Italian trattoria covered in ivy, with a heated garden. Fresh pasta and simple grilled dishes at fair prices. Quiet enough to talk.'},
  {id:'birds', name:'Birds of a Feather', sub:'Sichuan Chinese · 191 Grand St', lat:40.7143, lon:-73.9605, url:'https://birdsofafeatherny.com/',
   about:'Bright, modern Sichuan cooking — dumplings, noodles, dry-fried green beans — meant for sharing. Some dishes are spicy, but the menu says which. One of the better-value dinners in the neighbourhood.'},
  {id:'pies', name:'Pies ’n’ Thighs', sub:'Fried chicken and pie · 166 S 4th St', lat:40.7112, lon:-73.9613, url:'https://www.piesnthighs.com/', img:'img/pies.webp',
   about:'Southern comfort food in a small, cheerful room: fried chicken, biscuits, mac and cheese, and a slice of pie to finish. As simple as it gets, and very good.'},
  {id:'llama', name:'Llama Inn', sub:'Peruvian · 50 Withers St', lat:40.7167, lon:-73.9504, url:'https://www.llamainn.com/', img:'img/llama.webp',
   about:'Lively modern Peruvian food — ceviche, grilled skewers, a big beef stir-fry to share — in a bright corner room full of plants. A notch pricier than the others here, but still relaxed. Book ahead for Saturday.'},
  {id:'sunday', name:'Sunday in Brooklyn', sub:'Brunch · 348 Wythe Ave', lat:40.7142, lon:-73.9653, url:'https://www.sundayinbrooklyn.com/',
   about:'The neighbourhood’s famous brunch, best known for a tall stack of pancakes with hazelnut-maple sauce. A fine way to start Sunday. There is usually a wait, so go early.'},
  {id:'lindustrie', name:'L’Industrie Pizzeria', sub:'Pizza by the slice · 254 S 2nd St', lat:40.7116, lon:-73.9578, url:'https://www.lindustriebk.com/',
   about:'Many people’s pick for the best slice in New York. It is a counter with a line out the door and almost nowhere to sit — a quick, cheap lunch, not a dinner.'},
  {id:'radegast', name:'Radegast Hall', sub:'Beer hall with live music · 113 N 3rd St', lat:40.7166, lon:-73.9615, url:'https://radegasthall.com/', img:'img/radegast.webp',
   about:'A big, noisy Central European beer hall with long wooden tables, sausages and pretzels off the grill, and a live band most nights and weekend afternoons — often jazz or bluegrass.'},
  {id:'devocion', name:'Devoción', sub:'Coffee · 69 Grand St', lat:40.7148, lon:-73.9622, url:'https://www.devocion.com/', img:'img/devocion.webp',
   about:'A big, sunny coffee house under a skylight, with a wall of green plants and beans roasted on the spot. A good first stop on Saturday afternoon.'},
];
W_SEE.forEach(p => p.kind = 'see');
W_EAT.forEach(p => p.kind = 'eat');
// Manhattan, from the December trip map. Their photos live one folder up.
const farAway = list => list.map(p => Object.assign({}, p, {far:true, img:p.img ? '../' + p.img : undefined}));
const PAGE = {
  hotel:W_HOTEL, show:W_SHOW,
  places:[...W_SEE, ...farAway(PLACES)],
  eats:[...W_EAT, ...farAway(EATS)],
  trip:[
    {k:'sat', d:'2026-11-21', name:'Saturday', date:'Nov 21', lines:['The afternoon to explore', 'Dinner out — three picks are marked']},
    {k:'sun', d:'2026-11-22', name:'Sunday',   date:'Nov 22', lines:['All day to explore', 'Rising Appalachia · doors 6:30, show 7:30 PM']},
  ],
  normals:[{h:52,l:41},{h:52,l:41}], month:'late November',
  from:'from your hotel', nearest:'nearest your hotel first',
  kind:{see:'Something to do', eat:'Place to eat', hotel:'Where you’re staying', show:'Your show · Sunday night'},
  farLabel:'Include Manhattan', nearLabel:'Back to Brooklyn',
};
