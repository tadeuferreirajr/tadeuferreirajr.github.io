"use strict";

function calculate(rows, count) {
  const average = Array.from({ length: count }, (_, i) =>
    rows.reduce((sum, row) => sum + row[i], 0) / rows.length);
  const covariance = average.map((mean, i) => average.map((other, j) =>
    rows.reduce((sum, row) => sum + (row[i] - mean) * (row[j] - other), 0) / (rows.length - 1)));
  const point = (weights) => ({
    weights,
    risk: Math.sqrt(Math.max(0, 12 * weights.reduce((sum, w, i) =>
      sum + w * weights.reduce((subtotal, other, j) => subtotal + other * covariance[i][j], 0), 0))),
    return: 12 * weights.reduce((sum, w, i) => sum + w * average[i], 0),
  });
  if (count === 1) return { frontier: [point([1])], assets: [point([1])], correlation: null };
  const [a, b] = [covariance[0][0], covariance[1][1]];
  const c = covariance[0][1];
  const denominator = a + b - 2 * c;
  const minimumWeight = denominator > 0 ? Math.max(0, Math.min(1, (b - c) / denominator)) : 0.5;
  const maximumReturnWeight = average[0] > average[1] ? 1 : 0;
  const frontier = average[0] === average[1] ? [point([minimumWeight, 1 - minimumWeight])]
    : Array.from({ length: 101 }, (_, i) => {
      const w = minimumWeight + i / 100 * (maximumReturnWeight - minimumWeight);
      return point([w, 1 - w]);
    });
  return { frontier, assets: [point([1, 0]), point([0, 1])], correlation: a > 0 && b > 0 ? c / Math.sqrt(a * b) : null };
}

const el = (id) => document.getElementById(id);
const percent = (x) => (x * 100).toFixed(2) + "%";
let data;
let visible;

function drawChart() {
  if (!visible) return;
  const { frontier, assets, labels } = visible;
  const chart = el("frontier-chart");
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  chart.width = width * scale;
  chart.height = height * scale;
  const ctx = chart.getContext("2d");
  ctx.scale(scale, scale);
  const left = 61, right = width - 23, top = 16, bottom = height - 38;
  const points = frontier.concat(assets);
  const maxX = Math.max(0.01, ...points.map(p => p.risk)) * 1.10;
  const low = Math.min(...points.map(p => p.return));
  const high = Math.max(...points.map(p => p.return));
  const pad = Math.max(0.01, (high - low) * 0.16);
  const x = (value) => left + value / maxX * (right - left);
  const y = (value) => bottom - (value - low + pad) / (high - low + 2 * pad) * (bottom - top);
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#4b627a";
  ctx.strokeStyle = "#d4e0ec";
  for (let i = 0; i <= 4; i++) {
    const xp = left + (right - left) * i / 4;
    const yp = bottom - (bottom - top) * i / 4;
    ctx.beginPath();
    ctx.moveTo(xp, top); ctx.lineTo(xp, bottom);
    ctx.moveTo(left, yp); ctx.lineTo(right, yp);
    ctx.stroke();
    ctx.fillText(percent(maxX * i / 4), xp - 14, bottom + 16);
    ctx.fillText(percent(low - pad + (high - low + 2 * pad) * i / 4), 4, yp + 4);
  }
  ctx.fillText("Annualized volatility", left, height - 4);
  ctx.strokeStyle = "#245d93";
  ctx.lineWidth = 3;
  ctx.beginPath();
  frontier.forEach((p, i) => i ? ctx.lineTo(x(p.risk), y(p.return)) : ctx.moveTo(x(p.risk), y(p.return)));
  ctx.stroke();
  assets.forEach((p, i) => {
    ctx.fillStyle = "#4b627a";
    ctx.beginPath(); ctx.arc(x(p.risk), y(p.return), 4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillText(labels[i], x(p.risk) - 18, y(p.return) - 8);
  });
  const minimum = frontier[0];
  ctx.fillStyle = "#245d93";
  ctx.beginPath(); ctx.arc(x(minimum.risk), y(minimum.return), 5, 0, 2 * Math.PI); ctx.fill();
}

function render() {
  const start = el("start-month").value, end = el("end-month").value;
  const chosen = [...document.querySelectorAll("input[name=asset]:checked")].map(input => input.value);
  const indices = chosen.map(ticker => data.assets.indexOf(ticker) + 1);
  const sample = data.rows.filter(row => row[0] >= start && row[0] <= end &&
    indices.every(i => Number.isFinite(row[i])));
  const error = !chosen.length ? "Select at least one asset."
    : !start || !end || start > end ? "Enter a valid period."
    : sample.length < 2 ? "Select a period with at least two monthly observations." : "";
  el("frontier-output").hidden = Boolean(error);
  el("sample-info").textContent = error || sample.length + " monthly observations · " +
    sample[0][0] + " to " + sample.at(-1)[0];
  if (error) { visible = undefined; return; }
  visible = { ...calculate(sample.map(row => indices.map(i => row[i])), chosen.length), labels: chosen };
  el("frontier-heading").textContent = chosen.length === 2 ? "Efficient frontier" : "Single-asset result";
  el("correlation-result").textContent = visible.correlation === null ? "—" : visible.correlation.toFixed(3);
  const points = [["Minimum variance", visible.frontier[0]],
    ...visible.assets.map((point, i) => [chosen[i], point])];
  const table = el("frontier-table");
  table.replaceChildren();
  const header = table.createTHead().insertRow();
  for (const label of ["Portfolio", ...chosen, "Ann. return", "Ann. volatility"]) {
    const th = document.createElement("th");
    th.scope = "col"; th.textContent = label; header.append(th);
  }
  const body = table.createTBody();
  for (const [name, point] of points) {
    const row = body.insertRow();
    for (const value of [name, ...point.weights.map(percent), percent(point.return), percent(point.risk)]) {
      row.insertCell().textContent = value;
    }
  }
  drawChart();
}

fetch("./monthly-returns.json").then(response => {
  if (!response.ok) throw Error("Dataset unavailable");
  return response.json();
}).then(dataset => {
  data = dataset;
  const first = data.rows[0][0], last = data.rows.at(-1)[0];
  for (const [id, value] of [["start-month", data.rows.find(row => row.slice(1).every(Number.isFinite))[0]], ["end-month", last]]) {
    const field = el(id);
    field.min = first; field.max = last; field.value = value;
  }
  el("frontier-controls").disabled = false;
  el("frontier-controls").addEventListener("input", render);
  window.addEventListener("resize", drawChart);
  render();
}).catch(() => { el("sample-info").textContent = "Monthly returns could not be loaded. Reload the page to try again."; });
