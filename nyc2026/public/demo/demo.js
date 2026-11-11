/* The demo map: the same hotel, show, places and restaurants as the trip map,
   with every personal detail made up — names, dates, flights, seats, ticket
   numbers, amounts and the mailing address. Loaded after ../places.js and
   before ../invoice.js and ../nyc.js, which read PAGE and INVOICE when they exist. */
[...PLACES, ...EATS].forEach(p => { if (p.img) p.img = '../' + p.img; });

const PAGE = {
  hotel: {...HOTEL,
    about:'Home base for all three nights. Check-in is Friday from 3:00 PM and check-out is Monday by 12:00 PM. Every walking time on this map is measured from here.'},
  show: {...SHOW, label:'Our show · Sat 7:30',
    about:'Our Broadway night: Saturday, December 12. The curtain goes up at 7:30 PM, and our seats are Orchestra H101–H105. Plan to be at the theatre by 7:00.'},
  trip: [
    {k:'fri', d:'2026-12-11', name:'Friday',   date:'Dec 11', lines:['Leave Chicago 9:15 AM', 'Land at LaGuardia 12:25 PM', 'Hotel check-in 3:00 PM']},
    {k:'sat', d:'2026-12-12', name:'Saturday', date:'Dec 12', lines:['Free until the evening', 'Broadway show 7:30 PM']},
    {k:'sun', d:'2026-12-13', name:'Sunday',   date:'Dec 13', lines:['A free day']},
    {k:'mon', d:'2026-12-14', name:'Monday',   date:'Dec 14', lines:['Hotel check-out by noon', 'Leave LaGuardia 2:40 PM', 'Land in Chicago 4:10 PM']},
  ],
};

const INVOICE = {
  fare: 380.00, seat: 30.00, showTotal: 540.00,
  crew: [
    {name:'Ava',  tkt:'0000000000001', emd:'0000000000101', paid:true},   // shows a receipt
    {name:'Ben',  tkt:'0000000000002', emd:'0000000000102'},              // shows an unpaid invoice
    {name:'Cleo', tkt:'0000000000003', emd:'0000000000103', fronted:true},
  ],
  airline: 'Northwind Air',
  route: 'ORD/LGA · Dec 11 + Dec 14',
  flights: 'NW 204 / NW 219',
  out:  'ORD 9:15a to LGA 12:25p, Fri Dec 11 (NW 204, Economy)',
  back: 'LGA 2:40p to ORD 4:10p, Mon Dec 14 (NW 219, Economy)',
  order: 'Box office · DEMO-0001',
  seats: 'Sat Dec 12, 7:30 PM · Orchestra H101–H105',
  due: 'Nov 30, 2026', dueNote: 'End of the month',
  charged: 'Charges hit the card Oct 1 (box office) and Oct 2 (Northwind).',
  mail: '100 Example Street, Springfield',
};
