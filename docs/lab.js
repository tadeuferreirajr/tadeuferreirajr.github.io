"use strict";

const byId = (id) => document.getElementById(id);
const value = (id) => Number(byId(id).value);
const put = (id, text) => { byId(id).textContent = text; };
const pct = (value, digits = 1) => value.toFixed(digits) + "%";
const signed = (number) => (number > 0 ? "+" : "") + pct(number, 2);
const colors = { blue: "#6788ac", navy: "#123b6a", grid: "#dbe5ef", text: "#435a73" };
const maturities = [1, 2, 3, 5, 7, 10, 20, 30];
const yields = [4.15, 4.08, 4.11, 4.22, 4.34, 4.48, 4.75, 4.80];

function drawChart(id, series, options) {
  const canvas = byId(id);
  if (!canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const deviceScale = window.devicePixelRatio || 1;
  canvas.width = width * deviceScale;
  canvas.height = height * deviceScale;
  const ctx = canvas.getContext("2d");
  ctx.scale(deviceScale, deviceScale);
  const left = 43, right = width - 13, top = 16, bottom = height - 27;
  const y = (number) => bottom - (number - options.min) / (options.max - options.min) * (bottom - top);
  const x = (number, count) => left + number / (count - 1) * (right - left);
  ctx.font = "11px monospace";
  ctx.fillStyle = colors.text;
  ctx.strokeStyle = colors.grid;
  ctx.textAlign = "right";
  for (let row = 0; row <= 4; row++) {
    const level = options.min + (options.max - options.min) * row / 4;
    ctx.beginPath();
    ctx.moveTo(left, y(level));
    ctx.lineTo(right, y(level));
    ctx.stroke();
    ctx.fillText(level.toFixed(options.decimals), left - 7, y(level) + 3);
  }
  ctx.textAlign = "center";
  options.labels.forEach((label, index) => {
    ctx.fillText(label, x(index, options.labels.length), bottom + 19);
  });
  series.forEach(({ data, color, dashed }) => {
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    data.forEach((point, index) => {
      const px = x(index, data.length);
      if (index === 0) ctx.moveTo(px, y(point));
      else ctx.lineTo(px, y(point));
    });
    ctx.stroke();
    if (data.length < 15) data.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(x(index, data.length), y(point), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function bondMove(years, initialYield, shockedYield) {
  const discountRate = shockedYield / 100;
  const coupon = initialYield / 100;
  let price = 1 / (1 + discountRate) ** years;
  for (let year = 1; year <= years; year++) price += coupon / (1 + discountRate) ** year;
  return (price - 1) * 100;
}

function updateMacro() {
  const scenario = byId("scenario").value;
  const shock = value("shock");
  const weights = {
    parallel: [1, 1, 1, 1, 1, 1, 1, 1],
    steep: [0.2, 0.25, 0.35, 0.5, 0.7, 0.85, 1, 1],
    front: [1, 0.9, 0.75, 0.55, 0.4, 0.3, 0.18, 0.1],
  };
  const newYields = yields.map((rate, index) => rate + shock / 100 * weights[scenario][index]);
  put("shock-value", (shock > 0 ? "+" : "") + shock + " bp");
  put("bond-2", signed(bondMove(2, yields[1], newYields[1])));
  put("bond-10", signed(bondMove(10, yields[5], newYields[5])));
  const labels = maturities.map((years) => years + "Y");
  drawChart("macro-chart", [
    { data: yields, color: colors.blue, dashed: true },
    { data: newYields, color: colors.navy },
  ], { min: 2.5, max: 6.5, labels, decimals: 1 });
  byId("macro-chart").setAttribute("aria-label", maturities.map((years, index) =>
    years + " years, baseline " + pct(yields[index], 2) + ", scenario " + pct(newYields[index], 2)).join(". "));
}

function discountedCashFlow(growth, margin, discount, terminalGrowth) {
  let revenue = 10;
  let cashFlow = 0;
  let presentValue = 0;
  for (let year = 1; year <= 5; year++) {
    const previousRevenue = revenue;
    revenue *= 1 + growth;
    cashFlow = revenue * (margin * 0.75 + 0.03 - 0.04) - 0.1 * (revenue - previousRevenue);
    presentValue += cashFlow / (1 + discount) ** year;
  }
  const terminalValue = cashFlow * (1 + terminalGrowth) / (discount - terminalGrowth);
  const discountedTerminal = terminalValue / (1 + discount) ** 5;
  const enterpriseValue = presentValue + discountedTerminal;
  return { perShare: (enterpriseValue - 3) / 0.5, terminalWeight: discountedTerminal / enterpriseValue };
}

function updateDcf() {
  ["growth", "margin", "wacc", "terminal"].forEach((id) => put(id + "-value", pct(value(id), 2)));
  const growth = value("growth") / 100;
  const margin = value("margin") / 100;
  const wacc = value("wacc") / 100;
  const terminalGrowth = value("terminal") / 100;
  const result = discountedCashFlow(growth, margin, wacc, terminalGrowth);
  put("share-value", "$" + result.perShare.toFixed(2));
  put("terminal-weight", pct(result.terminalWeight * 100));
  const steps = [-2, -1, 0, 1, 2];
  const spreads = steps.map((step) => terminalGrowth + step * 0.005);
  const table = document.createElement("table");
  table.setAttribute("aria-label", "Valuation sensitivity. Rows are WACC and columns are terminal growth.");
  const header = table.createTHead().insertRow();
  header.innerHTML = '<th scope="col">WACC / g</th>' + spreads.map((rate) => '<th scope="col">' + pct(rate * 100) + "</th>").join("");
  const body = table.createTBody();
  steps.forEach((step) => {
    const discount = wacc + step * 0.005;
    const row = body.insertRow();
    row.innerHTML = '<th scope="row">' + pct(discount * 100) + "</th>";
    spreads.forEach((rate, column) => {
      const cell = row.insertCell();
      if (discount - rate < 0.0001) {
        cell.textContent = "—";
        cell.title = "WACC must exceed terminal growth";
        return;
      }
      const price = discountedCashFlow(growth, margin, discount, rate).perShare;
      const relativeValue = (price - result.perShare) / Math.max(1, result.perShare);
      const opacity = Math.min(0.62, 0.15 + Math.abs(relativeValue) * 1.5);
      cell.style.background = relativeValue >= 0 ? "rgba(66, 147, 146, " + opacity + ")" : "rgba(166, 92, 87, " + opacity + ")";
      cell.textContent = "$" + price.toFixed(2);
      if (step === 0 && column === 2) cell.className = "base";
    });
  });
  byId("heatmap").replaceChildren(table);
}

function simulatePrices() {
  let seed = 25937;
  let deviation = 0;
  function uniform() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  }
  return Array.from({ length: 756 }, (_, day) => {
    const normal = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    deviation = 0.94 * deviation + 0.012 * normal;
    return 100 * Math.exp(0.00024 * day + deviation);
  });
}

const prices = simulatePrices();

function backtest(lookback, threshold, cost) {
  const strategy = [100];
  const benchmark = [100];
  const start = 40;
  const last = prices.length - 1;
  let position = false;
  let equity = 100;
  let peak = 100;
  let drawdown = 0;
  let entries = 0;

  for (let day = start + 1; day <= last; day++) {
    if (position) equity *= prices[day] / prices[day - 1];
    const history = prices.slice(day - lookback, day);
    const mean = history.reduce((sum, price) => sum + price, 0) / lookback;
    const variance = history.reduce((sum, price) => sum + (price - mean) ** 2, 0) / lookback;
    const signal = (prices[day - 1] - mean) / Math.sqrt(variance);
    const nextPosition = day !== last && (position ? signal < 0 : signal <= -threshold);
    if (nextPosition !== position) {
      equity *= 1 - cost;
      if (nextPosition) entries++;
      position = nextPosition;
    }
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity / peak - 1);
    strategy.push(equity);
    const benchmarkCosts = day === last ? (1 - cost) ** 2 : 1 - cost;
    benchmark.push(100 * prices[day] / prices[start] * benchmarkCosts);
  }
  return { strategy, benchmark, drawdown, entries };
}

function updateQuant() {
  put("threshold-value", "−" + value("threshold").toFixed(1));
  put("cost-value", value("cost") + " bp");
  const result = backtest(value("lookback"), value("threshold"), value("cost") / 10000);
  put("strategy-return", signed(result.strategy.at(-1) - 100));
  put("benchmark-return", signed(result.benchmark.at(-1) - 100));
  put("max-dd", pct(result.drawdown * 100, 2));
  put("trades", result.entries);
  const range = [...result.benchmark, ...result.strategy];
  const minimum = Math.floor(Math.min(...range) / 10) * 10;
  const maximum = Math.ceil(Math.max(...range) / 10) * 10;
  drawChart("quant-chart", [
    { data: result.benchmark, color: colors.blue, dashed: true },
    { data: result.strategy, color: colors.navy },
  ], { min: minimum, max: maximum, labels: ["Start", "¼", "½", "¾", "End"], decimals: 1 });
  byId("quant-chart").setAttribute("aria-label", "Indexed simulation. Sample rule ends at " +
    result.strategy.at(-1).toFixed(2) + ". Simulated benchmark ends at " + result.benchmark.at(-1).toFixed(2) + ".");
}

[
  [["scenario", "shock"], updateMacro],
  [["growth", "margin", "wacc", "terminal"], updateDcf],
  [["lookback", "threshold", "cost"], updateQuant],
].forEach(([ids, update]) => {
  if (!byId(ids[0])) return;
  ids.forEach((id) => byId(id).addEventListener("input", update));
  update();
  if (update !== updateDcf) window.addEventListener("resize", update);
});
