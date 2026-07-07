/* Shared aggregates for 160 Weldon pages. Expects data.js and charts.js loaded first. */
(function () {
  const D = window.WELDON;
  const usd = window.WCharts.fmtUSD;

  const SERIES_COLORS = {
    electricity: getCss('--c-electricity'),
    water: getCss('--c-water'),
    internet: getCss('--c-internet'),
    tax: getCss('--c-tax'),
    insurance: getCss('--c-insurance'),
    maintenance: getCss('--c-maintenance'),
  };
  const CAT_COLORS = {
    'Paint & finishes': SERIES_COLORS.water,
    'Garden & grounds': SERIES_COLORS.maintenance,
    'Systems & appliances': SERIES_COLORS.electricity,
    'Patio & furnishings': SERIES_COLORS.internet,
    'Hardware & misc': SERIES_COLORS.tax,
  };

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* one-time expense totals per month across 2024–2025 (24 slots) */
  function expenseMonthlyTotals() {
    const totals = new Array(24).fill(0);
    D.expenses.forEach(e => {
      if (!e.date) return;
      const y = +e.date.slice(0, 4), m = +e.date.slice(5, 7);
      const idx = (y - 2024) * 12 + (m - 1);
      if (idx >= 0 && idx < 24) totals[idx] += e.amount;
    });
    return totals.map(v => Math.round(v * 100) / 100);
  }

  function yearTotal(year) {
    return D.expenses.filter(e => e.year === year).reduce((a, e) => a + e.amount, 0);
  }

  function categoryTotals() {
    const map = {};
    D.expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, color: CAT_COLORS[label] || SERIES_COLORS.tax }));
  }

  function avg(arr) {
    const v = arr.filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  /* monthly utilities run-rate from most recent year with data, per series */
  function utilityRunRate() {
    const u = D.utilities;
    const recent = k => avg(u[k].slice(12)) ?? avg(u[k]); // prefer 2025
    const elec = recent('electricity') || 0;
    const water = recent('water') || 0;
    const net = recent('internet') || 0;
    return { elec, water, net, total: elec + water + net };
  }

  const INSURANCE_YR = 1100; // from sheet note: "12 mo @ 1100/year"

  function runRate() {
    const u = utilityRunRate();
    return u.total + INSURANCE_YR / 12;
  }

  function openTasks() {
    return D.todo.filter(t => {
      const s = (t.status || '').toLowerCase();
      const p = (t.priority || '').toLowerCase();
      return s !== 'completed' && p !== 'done';
    });
  }

  function highPriority() {
    return openTasks().filter(t => (t.priority || '').toLowerCase() === 'high');
  }

  /* amortized monthly payment: principal, annual rate %, months */
  function pmt(principal, annualRate, months) {
    const r = annualRate / 100 / 12;
    if (r === 0) return principal / months;
    return principal * r / (1 - Math.pow(1 + r, -months));
  }

  window.W = {
    D, usd, MONTHS,
    SERIES_COLORS, CAT_COLORS, INSURANCE_YR,
    expenseMonthlyTotals, yearTotal, categoryTotals,
    utilityRunRate, runRate, openTasks, highPriority, pmt,
  };
})();
