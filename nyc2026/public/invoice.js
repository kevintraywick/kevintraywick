/* ================= WHO OWES WHAT ================= */
// Kevin fronted these. Cents on the two American charges were cut off in the
// statement screenshot — correct FARE and SEAT here and everything re-totals.
const FARE = 455.00;        // AA ticket, one per person (tkt 00123781001xx)
const SEAT = 45.00;         // AA seat selection, one per person (00142105997xx)
const SHOW_TOTAL = 661.83;  // Broadway.com, 3 tickets, order 207237762-8633251
const CREW = [
  // paid:true turns the invoice into a receipt, stamps it, and stands Luigi down
  {name:'Amy',   tkt:'0012378100111', emd:'0014210599730', paid:true},
  {name:'Lisa',  tkt:'0012378100112', emd:'0014210599731', paid:true},
  {name:'Kevin', tkt:'0012378100113', emd:'0014210599732', fronted:true},
];
const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const SHARE = Math.round(SHOW_TOTAL / CREW.length * 100) / 100;
const perPerson = () => FARE + SEAT + SHARE;
const advanced  = () => CREW.length * (FARE + SEAT) + SHOW_TOTAL;
const GUIDO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360" width="320" height="360"> <defs> <pattern id="pin" width="7" height="7" patternUnits="userSpaceOnUse"> <rect width="7" height="7" fill="#1e1e1e"/> <line x1="3.5" y1="0" x2="3.5" y2="7" stroke="#787878" stroke-width="0.9"/> </pattern> </defs> <g stroke="#111" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"> <!-- bat leaning against his side, butt on the ground --> <g transform="translate(-42,0) rotate(13 268 352)"> <rect x="256" y="120" width="24" height="112" rx="12" fill="#c99a5b"/> <rect x="260" y="228" width="16" height="124" rx="8" fill="#a87a3e"/> <line x1="260" y1="268" x2="276" y2="268" stroke-width="3"/> </g> <!-- shoulders / torso --> <path d="M72 352 V244 c0-42 28-64 78-64 s78 22 78 64 V352 Z" fill="url(#pin)"/> <!-- shirt V + lapels --> <path d="M124 184 L150 240 L176 184 Z" fill="#fff"/> <path d="M124 184 L150 240 L137 184 Z" fill="#141414"/> <path d="M176 184 L150 240 L163 184 Z" fill="#141414"/> <path d="M150 240 l-9 11 9 34 9-34 Z" fill="#d81f16"/> <!-- crossed arms: far arm first, then near arm on top --> <g fill="#212121"> <rect x="86" y="258" width="132" height="34" rx="17" transform="rotate(9 152 275)"/> <rect x="86" y="250" width="132" height="34" rx="17" transform="rotate(-9 152 267)"/> </g> <circle cx="96" cy="262" r="18" fill="#f0c9a0"/> <path d="M85 258 q11 6 22 0" stroke-width="2.4" fill="none"/> <circle cx="209" cy="286" r="18" fill="#f0c9a0"/> <path d="M198 282 q11 6 22 0" stroke-width="2.4" fill="none"/> <!-- neck --> <rect x="134" y="152" width="32" height="32" fill="#f0c9a0"/> <!-- head --> <path d="M104 102 c0-36 20-56 46-56 s46 20 46 56 c0 38-20 60-46 60 s-46-22-46-60 Z" fill="#f0c9a0"/> <circle cx="102" cy="110" r="9" fill="#f0c9a0"/> <circle cx="198" cy="110" r="9" fill="#f0c9a0"/> <!-- brows --> <path d="M117 92 l28 9" stroke-width="7" fill="none"/> <path d="M183 92 l-28 9" stroke-width="7" fill="none"/> <circle cx="129" cy="112" r="4.6" fill="#111" stroke="none"/> <circle cx="171" cy="112" r="4.6" fill="#111" stroke="none"/> <path d="M151 114 q8 14 -3 18" stroke-width="3" fill="none"/> <!-- mustache --> <path d="M122 142 q28-17 28 1 q0-18 28-1 q-13 15 -28 8 q-15 7 -28-8 Z" fill="#2a2a2a"/> <path d="M137 157 q13 6 26 0" stroke-width="3" fill="none"/> <!-- fedora --> <path d="M80 62 q70 17 140 0 q-7 13 -15 15 q-55 13 -110 0 q-8-2 -15-15 Z" fill="#161616"/> <path d="M107 60 q-5-44 43-44 q48 0 43 44 q-43 13 -86 0 Z" fill="#161616"/> <path d="M105 49 q45 13 90 0" stroke="#d81f16" stroke-width="7" fill="none"/> </g> </svg>`;
function guidoPNG(){
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 720;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,640,720);
      x.drawImage(img, 0, 0, 640, 720); res(c.toDataURL('image/png'));
    };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(GUIDO_SVG);
  });
}

async function invoice(who){
  const c = CREW.find(x => x.name === who); if (!c) return;
  // opened synchronously so Safari treats it as part of the click, not a popup
  const win = window.open('', '_blank');
  if (!window.jspdf){ if (win) win.close(); alert("Couldn't load the PDF library — check your connection and try again."); return; }
  const { jsPDF } = window.jspdf;
  const d = new jsPDF({unit:'mm', format:'letter'});
  const W = 215.9, M = 18, RED = [224,36,27], INK = [20,20,20], GREY = [110,106,98];
  const settle = c.fronted;
  const paid = !!c.paid;                                   // this person has paid Kevin back
  const debtors = CREW.filter(x => !x.fronted);
  const allPaid = debtors.every(x => x.paid);              // ...and so has everybody else
  // A rubber stamp, slapped on a little crooked. jsPDF can turn text but not a
  // rectangle, so the frame is four lines between corners turned by hand.
  const stamp = (cx, cy, big, small, deg) => {
    const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const at = (dx, dy) => [cx + dx*cos + dy*sin, cy - dx*sin + dy*cos];
    d.setFont('helvetica','bold'); d.setFontSize(38);
    const bw = d.getTextWidth(big);
    d.setFontSize(7.6);
    const sw = d.getTextWidth(small);
    const hw = Math.max(bw, sw) / 2 + 6, hh = 13;
    d.setDrawColor(...RED); d.setTextColor(...RED);
    for (const [inset, lw] of [[0, 1.3], [1.9, 0.35]]){
      d.setLineWidth(lw);
      const k = [at(-hw+inset, -hh+inset), at(hw-inset, -hh+inset), at(hw-inset, hh-inset), at(-hw+inset, hh-inset)];
      k.forEach((p, i) => { const q = k[(i+1) % 4]; d.line(p[0], p[1], q[0], q[1]); });
    }
    d.setFontSize(38); d.text(big, ...at(-bw/2, 3.4), {angle:deg});
    d.setFontSize(7.6); d.text(small, ...at(-sw/2, 9.2), {angle:deg});
  };
  const num = 'NYC-2026-' + String(CREW.indexOf(c)+1).padStart(3,'0');

  // header
  d.setFillColor(...INK); d.rect(0,0,W,34,'F');
  d.setFillColor(...RED); d.rect(0,34,W,2.2,'F');
  d.setTextColor(255,255,255);
  d.setFont('helvetica','bold'); d.setFontSize(22); d.text('GUIDO & SONS', M, 17);
  d.setFont('helvetica','normal'); d.setFontSize(9.5); d.setTextColor(200,198,194);
  d.text('TRAVEL RECEIVABLES  ·  NOMAD, NEW YORK  ·  NO EXCEPTIONS, NO EXCUSES', M, 25.5);
  d.setTextColor(255,255,255); d.setFont('helvetica','bold'); d.setFontSize(13);
  d.text(settle ? 'SETTLEMENT' : paid ? 'RECEIPT' : 'INVOICE', W-M, 17, {align:'right'});
  d.setFont('helvetica','normal'); d.setFontSize(9.5); d.setTextColor(200,198,194);
  d.text(num, W-M, 25.5, {align:'right'});

  let y = 52;
  d.setTextColor(...GREY); d.setFont('helvetica','bold'); d.setFontSize(8.6);
  d.text(settle ? 'PREPARED FOR' : paid ? 'THE PARTY IN GOOD STANDING' : 'THE PARTY IN ARREARS', M, y);
  d.text('ISSUED', 120, y); d.text(paid || (settle && allPaid) ? 'STATUS' : 'DUE', 158, y);
  d.setTextColor(...INK); d.setFont('helvetica','bold'); d.setFontSize(17);
  d.text(c.name, M, y+9);
  d.setFont('helvetica','normal'); d.setFontSize(10.5);
  d.text(new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), 120, y+9);
  d.setFont('helvetica','bold'); d.setTextColor(...RED);
  d.text(paid ? 'Paid in full' : settle && allPaid ? 'All square' : 'Oct 31, 2026', 158, y+9);
  d.setFont('helvetica','normal'); d.setFontSize(8.6); d.setTextColor(...GREY);
  d.text(paid ? 'Luigi has stood down' : settle && allPaid ? 'Everybody paid up' : 'Halloween', 158, y+14);

  y += 26;
  d.setDrawColor(...INK); d.setLineWidth(0.5); d.line(M, y, W-M, y);
  y += 6;
  d.setFont('helvetica','bold'); d.setFontSize(8.6); d.setTextColor(...GREY);
  d.text('DESCRIPTION', M, y); d.text('REFERENCE', 128, y); d.text('AMOUNT', W-M, y, {align:'right'});
  y += 3; d.setDrawColor(210,205,196); d.setLineWidth(0.3); d.line(M, y, W-M, y);

  const rows = settle ? [
    ['American Airlines — 3 × round trip', 'BNA/JFK · Dec 4 + Dec 7', CREW.length*FARE],
    ['Seat selection — 3 passengers', 'AA 4561 / AA 4350', CREW.length*SEAT],
    ['The Lost Boys — 3 tickets', 'Broadway.com · 207237762-8633251', SHOW_TOTAL],
  ] : [
    ['American Airlines — round trip', 'Ticket ' + c.tkt, FARE],
    ['  BNA 10:30a to JFK 1:59p, Fri Dec 4 (AA 4561, Business)', '', null],
    ['  JFK 1:27p to BNA 3:19p, Mon Dec 7 (AA 4350, Economy)', '', null],
    ['Seat selection', 'Doc ' + c.emd, SEAT],
    ['The Lost Boys — Palace Theatre', 'Broadway.com', SHARE],
    ['  Sat Dec 5, 7:30 PM · Orchestra O123–O127 · 1 of 3 seats', '', null],
  ];
  y += 7;
  for (const [desc, ref, amt] of rows){
    const sub = amt === null;
    d.setFont('helvetica', sub ? 'normal' : 'bold'); d.setFontSize(sub ? 9 : 10.5);
    d.setTextColor(...(sub ? GREY : INK));
    d.text(desc, M, y);
    if (!sub){
      d.setFont('helvetica','normal'); d.setFontSize(9); d.setTextColor(...GREY);
      d.text(ref, 128, y);
      d.setFont('helvetica','bold'); d.setFontSize(10.5); d.setTextColor(...INK);
      d.text(money(amt), W-M, y, {align:'right'});
    }
    y += sub ? 5.4 : 8;
  }

  y += 2; d.setDrawColor(...INK); d.setLineWidth(0.5); d.line(120, y, W-M, y); y += 9;
  d.setFont('helvetica','bold'); d.setFontSize(11); d.setTextColor(...INK);
  d.text(settle ? 'YOU ADVANCED' : paid ? 'TOTAL PAID' : 'TOTAL DUE', 120, y);
  const totalY = y;
  d.setFontSize(19); d.setTextColor(...(settle || paid ? INK : RED));
  d.text(money(settle ? advanced() : perPerson()), W-M, y, {align:'right'});

  if (settle){
    y += 11; d.setFontSize(11); d.setTextColor(...GREY); d.setFont('helvetica','bold');
    d.text('LESS YOUR OWN SHARE', 120, y);
    d.setFontSize(12); d.text('-' + money(perPerson()), W-M, y, {align:'right'});
    y += 5; d.setDrawColor(...INK); d.setLineWidth(0.5); d.line(120, y, W-M, y); y += 9;
    d.setFontSize(11); d.setTextColor(...INK); d.text(allPaid ? 'REPAID TO YOU' : 'OWED TO YOU', 120, y);
    d.setFontSize(19); d.setTextColor(...RED);
    d.text(money(advanced() - perPerson()), W-M, y, {align:'right'});
    y += 10; d.setFont('helvetica','normal'); d.setFontSize(9.5); d.setTextColor(...GREY);
    d.text(debtors.map(x => x.name + ' ' + money(perPerson()) + (x.paid ? ' (paid)' : '')).join('     ·     '), W-M, y, {align:'right'});
    if (allPaid) stamp(64, totalY + 14, 'ALL SQUARE', 'EVERYBODY PAID  ·  NOBODY GOT HURT', 9);
  } else if (paid){
    y += 9; d.setFont('helvetica','bold'); d.setFontSize(11); d.setTextColor(...GREY);
    d.text('BALANCE DUE', 120, y);
    d.setFontSize(12); d.text(money(0), W-M, y, {align:'right'});
    stamp(64, totalY + 9, 'PAID', 'IN FULL  ·  NO KNEECAPS WERE HARMED', 8);
  }

  // the enforcer
  const png = await guidoPNG();
  const baseY = Math.min(Math.max(y + 20, 150), 196);
  if (png) d.addImage(png, 'PNG', M, baseY, 46, 51.75);
  const bx = M + 52, bw = W - M - bx;
  d.setFillColor(248,245,238); d.setDrawColor(...INK); d.setLineWidth(0.5);
  d.roundedRect(bx, baseY + 6, bw, 34, 3, 3, 'FD');
  d.setFillColor(248,245,238); d.triangle(bx, baseY+19, bx, baseY+27, bx-5, baseY+23, 'F');
  d.setDrawColor(...INK); d.line(bx, baseY+19, bx-5, baseY+23); d.line(bx-5, baseY+23, bx, baseY+27);
  d.setFillColor(248,245,238); d.rect(bx-0.6, baseY+19.5, 1.2, 7, 'F');
  d.setTextColor(...INK); d.setFont('helvetica','bolditalic'); d.setFontSize(11.5);
  const line = settle
    ? (allPaid
        ? ['"They both paid up, boss. Didn\'t even need the bat.', 'Honestly? Little disappointed. Cannoli\'s on me."']
        : ['"You carried the freight, boss. I\'ll go have a word', 'with the other two. Friendly-like. At first."'])
    : paid
      ? ['"Paid in full! The bat goes back in the trunk, and', 'youse get first pick of the cannoli. You\'re family now."']
      : ['"Nice trip you got comin\'. Be a real shame if somebody', 'had to sit in the middle seat the whole way home."'];
  d.text(line[0], bx + 6, baseY + 17);
  d.text(line[1], bx + 6, baseY + 24);
  d.setFont('helvetica','normal'); d.setFontSize(8.6); d.setTextColor(...GREY);
  d.text(paid || (settle && allPaid) ? '— Luigi Guido, Collections (retired, as of this payment)' : '— Luigi Guido, Collections', bx + 6, baseY + 33);

  // footer
  const fy = 252;
  d.setDrawColor(210,205,196); d.setLineWidth(0.3); d.line(M, fy, W-M, fy);
  d.setFont('helvetica','normal'); d.setFontSize(9.5); d.setTextColor(...GREY);
  const foot = settle
    ? 'Charges hit the card Sep 16 (Broadway.com) and Sep 18 (American). Hotel and meals settle separately.'
    : paid ? 'Received with thanks by Kevin. Luigi has been reassigned to carrying your bags and will be gentle with them. '
      + 'Hotel and meals settle separately — he\'ll be in touch.'
    : 'Remit to Kevin — Zelle, Apple Pay, cash in a plain envelope, or check in the mail '
      + '(160 Weldon Drive, Martin, TN 38237). Hotel and meals settle separately.';
  d.splitTextToSize(foot, W - M*2).forEach((ln, i) => d.text(ln, M, fy + 7 + i*5.5));

  const file = 'NYC2026-' + c.name + (settle ? '-settlement' : paid ? '-receipt-PAID' : '-invoice') + '.pdf';
  if (win){
    try{
      const url = d.output('bloburl');
      // wrapped in a tiny page rather than navigating straight to the blob:
      // Safari is much happier showing a PDF this way
      win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + file +
        '</title><style>html,body{margin:0;height:100%;background:#525659}iframe{border:0;width:100%;height:100%;display:block}</style></head>' +
        '<body><iframe src="' + url + '" title="' + file + '"></iframe></body></html>');
      win.document.close();
    }catch(e){ try{ win.location.href = d.output('bloburl'); }catch(e2){} }
  } else {
    // tab blocked — fall back to a download so the invoice still arrives
    d.save(file);
  }
}

