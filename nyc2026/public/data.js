// Price snapshot. Edit freely — the page reads this file on load.
// Flights: nonstop BNA↔JFK only. Out = departs BNA 10am or later. Back = lands BNA by 8pm.
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
      { id: 'hampton',  name: 'Hampton Inn Manhattan-Chelsea', neighborhood: 'Chelsea · 108 W 24th St', room: '2 queens, free breakfast', nightly: 275,
        url: 'https://www.hilton.com/en/hotels/nycchhx-hampton-inn-manhattan-chelsea/', note: 'best Chelsea fit for three' },
      { id: 'cambria',  name: 'Cambria Hotel Chelsea', neighborhood: 'Chelsea · 123 W 28th St', room: '2 queens', nightly: 285,
        url: 'https://www.choicehotels.com/new-york/new-york/cambria-hotels/ny961', note: 'newer build, rooftop bar' },
      { id: 'hgi',      name: 'Hilton Garden Inn Chelsea', neighborhood: 'Chelsea · 121 W 28th St', room: '2 queens', nightly: 290,
        url: 'https://www.hilton.com/en/hotels/nycmcgi-hilton-garden-inn-new-york-manhattan-chelsea/', note: '3 blocks from Penn Station' },
      { id: 'hyatt',    name: 'Hyatt Place Midtown South', neighborhood: 'Midtown · 52 W 36th St', room: '2 queens + sofa bed, 310 sq ft', nightly: 330,
        url: 'https://www.hyatt.com/hyatt-place/en-US/nyczm-hyatt-place-new-york-midtown-south', note: 'bigger room, free breakfast · fallback if Chelsea sells out' }
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
