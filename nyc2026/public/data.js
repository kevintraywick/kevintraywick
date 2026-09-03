// Price snapshot. Edit freely — the page reads this file on load.
// Flights: nonstop BNA↔JFK only. Out = departs BNA 10am or later. Back = lands BNA by 8pm.
// Hotels: nightly is the pre-tax room rate; optional fee = per-night resort/destination fee (also taxed).
// roundTrip = estimated round-trip economy fare (Main cabin, not Basic). Times are the current
// published schedule; December times usually shift only a few minutes.
(function () {
  var out = [
    { airline: 'JetBlue',  dep: '10:30a', arr: '1:48p', roundTrip: 270, fareNote: 'Blue · Basic ~$60 less' },
    { airline: 'Delta',    dep: '11:25a', arr: '3:00p', roundTrip: 300, fareNote: 'Main · Basic ~$70 less' },
    { airline: 'Delta',    dep: '2:15p',  arr: '5:49p', roundTrip: 300, fareNote: 'Main' },
    { airline: 'Delta',    dep: '5:05p',  arr: '8:39p', roundTrip: 300, fareNote: 'Main' },
    { airline: 'American', dep: '5:39p',  arr: '9:19p', roundTrip: 290, fareNote: 'Main · Basic ~$50 less' },
    { airline: 'JetBlue',  dep: '5:58p',  arr: '9:28p', roundTrip: 270, fareNote: 'Blue' }
  ];
  var back = [
    { airline: 'Delta',    dep: '7:41a',  arr: '9:20a',  roundTrip: 300, fareNote: 'Main' },
    { airline: 'JetBlue',  dep: '8:00a',  arr: '9:32a',  roundTrip: 270, fareNote: 'Blue' },
    { airline: 'American', dep: '8:29a',  arr: '9:59a',  roundTrip: 290, fareNote: 'Main' },
    { airline: 'Delta',    dep: '11:30a', arr: '1:13p',  roundTrip: 300, fareNote: 'Main' },
    { airline: 'American', dep: '12:30p', arr: '2:10p',  roundTrip: 290, fareNote: 'Main' },
    { airline: 'JetBlue',  dep: '3:29p',  arr: '5:07p',  roundTrip: 270, fareNote: 'Blue' },
    { airline: 'American', dep: '3:30p',  arr: '5:07p',  roundTrip: 290, fareNote: 'Main' },
    { airline: 'Delta',    dep: '3:50p',  arr: '5:34p',  roundTrip: 300, fareNote: 'Main' }
  ];
  var flights = [];
  ['2026-12-03', '2026-12-04'].forEach(function (date) {
    out.forEach(function (f, i) {
      flights.push(Object.assign({ id: 'o' + date.slice(-2) + '-' + i, dir: 'out', date: date, from: 'BNA', to: 'JFK',
        note: date === '2026-12-04' ? 'Friday can run $20–40 higher' : '' }, f));
    });
  });
  ['2026-12-06', '2026-12-07'].forEach(function (date) {
    back.forEach(function (f, i) {
      flights.push(Object.assign({ id: 'b' + date.slice(-2) + '-' + i, dir: 'back', date: date, from: 'JFK', to: 'BNA', note: '' }, f));
    });
  });

  window.TRIP = {
    asOf: 'Sept 2, 2026',
    asOfNote: 'Fares are estimates for early December (Kayak shows ~$276 average round trip for the month); hotel rates are shoulder-season quotes marked up for December demand. Expect to land within about $50 of these.',
    hotelTaxRate: 0.1475, hotelNightFee: 3.5,
    days: [
      { id: '2026-12-03', dir: 'out',  label: 'Thu Dec 3' },
      { id: '2026-12-04', dir: 'out',  label: 'Fri Dec 4' },
      { id: '2026-12-06', dir: 'back', label: 'Sun Dec 6' },
      { id: '2026-12-07', dir: 'back', label: 'Mon Dec 7' }
    ],
    flights: flights,
    hotels: [
      { id: 'martinique', group: 'Chelsea & Midtown', name: 'Martinique New York on Broadway', neighborhood: 'Midtown / Herald Square · 49 W 32nd St', room: '2 queens (Curio by Hilton)', nightly: 275, fee: 46,
        url: 'https://www.hilton.com/en/hotels/nyccuqq-martinique-new-york-on-broadway/', note: 'landmark 1897 building, 2 blocks from Penn Station' },
      { id: 'hampton',  group: 'Chelsea & Midtown', name: 'Hampton Inn Manhattan-Chelsea', neighborhood: 'Chelsea · 108 W 24th St', room: '2 queens, free breakfast', nightly: 275,
        url: 'https://www.hilton.com/en/hotels/nyccshx-hampton-manhattan-chelsea/', note: 'best Chelsea fit for three' },
      { id: 'cambria',  group: 'Chelsea & Midtown', name: 'Cambria Hotel Chelsea', neighborhood: 'Chelsea · 123 W 28th St', room: '2 queens', nightly: 285,
        url: 'https://www.choicehotels.com/new-york/new-york/cambria-hotels/ny537', note: 'newer build, rooftop bar' },
      { id: 'hgi',      group: 'Chelsea & Midtown', name: 'Hilton Garden Inn Chelsea', neighborhood: 'Chelsea · 121 W 28th St', room: '2 queens', nightly: 290,
        url: 'https://www.hilton.com/en/hotels/nycchgi-hilton-garden-inn-new-york-manhattan-chelsea/', note: '3 blocks from Penn Station' },
      { id: 'standard', group: 'Chelsea & Midtown', name: 'The Standard, High Line', neighborhood: 'Meatpacking / West Chelsea · 848 Washington St', room: 'Standard Double, two doubles, 250 sq ft', nightly: 425, fee: 35,
        url: 'https://www.standardhotels.com/new-york/properties/high-line', note: 'straddles the High Line, floor-to-ceiling windows, the Top of the Standard bar · beds are doubles' },
      { id: 'knick',    group: 'Chelsea & Midtown', name: 'The Knickerbocker', neighborhood: 'Times Square · 42nd St & Broadway', room: 'Superior Room, two queens', nightly: 425, fee: 48,
        url: 'https://www.theknickerbocker.com/stay/', note: '1906 landmark, rooftop bar over Times Square · 5 blocks from the Lost Boys theatre' },

      { id: 'plaza',     group: 'Splurge', name: 'The Plaza', neighborhood: 'Central Park South · 768 Fifth Ave', room: 'Deluxe Two Queens, 550 sq ft', nightly: 1250, fee: 65,
        url: 'https://www.fairmont.com/en/hotels/new-york-city/the-plaza/rooms/q2a.room.html', note: 'the Plaza · fee includes a $50/day food credit · December is its priciest month' },
      { id: 'peninsula', group: 'Splurge', name: 'The Peninsula New York', neighborhood: 'Fifth Ave at 55th St', room: 'Deluxe Room, two queens, ~480 sq ft', nightly: 1150,
        url: 'https://www.peninsula.com/en/new-york/luxury-hotel-room-suite-types/deluxe-room', note: 'rooftop spa and pool, Fifth Ave holiday windows at the door · no destination fee found' },

      { id: 'onehotel',  group: 'Brooklyn', name: '1 Hotel Brooklyn Bridge', neighborhood: 'Dumbo · 60 Furman St', room: 'Harbor 2 Beds (2 doubles, sleeps 4)', nightly: 700, fee: 45,
        url: 'https://www.1hotels.com/brooklyn-bridge/sleep/dumbo-2-beds', note: 'skyline and bridge views, rooftop pool, Brooklyn Bridge Park at the door · beds are doubles, not queens' },
      { id: 'acebk',     group: 'Brooklyn', name: 'Ace Hotel Brooklyn', neighborhood: 'Downtown Brooklyn · 252 Schermerhorn St', room: 'Double, two queens, ~360 sq ft', nightly: 400, fee: 40,
        url: 'https://acehotel.com/brooklyn/rooms/double/', note: 'steps from the Atlantic Ave / Barclays subway hub, ~10 min to Manhattan' }
    ],
    // Per-person estimates. price 0 = free.
    things: [
      { id: 'sugarfish', name: 'Sugarfish', price: 85, note: 'omakase "Trust Me" dinner with a drink and tip · NoMad or Flatiron locations' },
      { id: 'lostboys', name: 'The Lost Boys, the musical', price: 150, note: 'Palace Theatre, 47th St · mezzanine ~$95–250, orchestra more · $45 rush/lottery if you\'re lucky' },
      { id: 'nypl', name: 'New York Public Library', price: 0, note: 'Rose Main Reading Room, 42nd & Fifth · free' },
      { id: 'rock', name: 'Rockefeller Center Christmas tree', price: 0, note: 'free to see · Top of the Rock is ~$40 extra if you want the view' },
      { id: 'firehouse', name: 'Ghostbusters firehouse', price: 0, note: 'Hook & Ladder 8, 14 N Moore St, Tribeca · working firehouse, photos from the sidewalk' },
      { id: 'wtc', name: 'World Trade Center', price: 33, note: 'memorial pools are free · 9/11 Museum $33 · One World Observatory ~$47 if you add it' },
      { id: 'met', name: 'Metropolitan Museum of Art', price: 30, note: 'Fifth Ave at 82nd · closed Wednesdays' },
      { id: 'gugg', name: 'Guggenheim Museum', price: 30, note: 'Fifth Ave at 89th, a short walk from the Met · closed Tuesdays' },
      { id: 'bridge', name: 'Walk the Brooklyn Bridge', price: 0, note: 'start in Brooklyn (subway to High St) and walk toward the skyline · about 30 min' },
      { id: 'village', name: 'Greenwich Village', price: 0, note: 'Washington Square, the West Village streets, a coffee stop on you' },
      { id: 'highline', name: 'The High Line & Chelsea Market', price: 0, note: 'right by the Chelsea hotels · free, and the market is lunch' }
    ],
    ground: [
      { name: 'AirTrain + LIRR to Penn Station', fare: '$14 (AirTrain $8.75 + CityTicket $5.25, $7.25 peak)', minutes: 35,
        note: 'AirTrain to Jamaica, then LIRR every few minutes. Penn (34th St) is the closest rail stop to Chelsea: a 10–15 min walk or one subway stop to the W 24th–28th St hotels. Buy in the MTA TrainTime app.' },
      { name: 'AirTrain + LIRR to Grand Central Madison', fare: '$14', minutes: 35, note: 'Same CityTicket pricing, trains about every 10 min. Less handy for Chelsea than Penn.' },
      { name: 'AirTrain + E train to 23rd St', fare: '$11.65 (AirTrain $8.75 + subway $2.90)', minutes: 55,
        note: 'The E from Jamaica (Sutphin Blvd) stops at 23rd St & 8th Ave, right in Chelsea. Slower but drops you at the door.' },
      { name: 'Yellow taxi, flat rate', fare: '$70 + surcharges, tolls and tip (about $95–115 all in)', minutes: 50,
        note: 'Split three ways it competes with the train and beats Uber. 45–75 min; Sunday afternoon and weekday evenings are worst.' },
      { name: 'Uber / Lyft', fare: '$60–80 base, $100–150 with surge', minutes: 50, note: 'Surges on Thu/Fri evenings and Sunday afternoons. The taxi flat rate usually wins for three people with bags.' }
    ]
  };
})();
