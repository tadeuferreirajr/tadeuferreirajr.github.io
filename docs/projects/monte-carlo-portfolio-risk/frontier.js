"use strict";

function minimumObjective(covariance, average, lambda, initial) {
  // Minimize w'Σw / 2 - λμ'w by shifting weight between pairs.
  const weights = initial.slice();
  const gradient = covariance.map((row, i) =>
    row.reduce((sum, value, j) => sum + value * weights[j], 0) - lambda * average[i]);
  for (let sweep = 0; sweep < 500; sweep++) {
    let largestMove = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = i + 1; j < weights.length; j++) {
        const curvature = covariance[i][i] + covariance[j][j] - 2 * covariance[i][j];
        const difference = gradient[j] - gradient[i];
        const step = curvature > 1e-16 ? difference / curvature
          : difference > 0 ? weights[j] : difference < 0 ? -weights[i] : 0;
        const move = Math.max(-weights[i], Math.min(weights[j], step));
        if (Math.abs(move) <= 1e-12) continue;
        weights[i] += move;
        weights[j] -= move;
        largestMove = Math.max(largestMove, Math.abs(move));
        for (let k = 0; k < weights.length; k++) {
          gradient[k] += move * (covariance[k][i] - covariance[k][j]);
        }
      }
    }
    if (largestMove < 1e-9) break;
  }
  return weights;
}

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
  const assets = average.map((_, i) => point(average.map((_, j) => Number(i === j))));
  let weights = minimumObjective(covariance, average, 0, average.map(() => 1 / count));
  const frontier = [point(weights)];
  const largestMean = Math.max(...average);
  const lowerMeans = average.filter(value => largestMean - value > 1e-12);
  if (lowerMeans.length && largestMean * 12 - frontier[0].return > 1e-10) {
    // This bound makes every lower-return asset unattractive at the upper endpoint.
    const maxCovariance = Math.max(...covariance.map((row, i) => row[i]));
    const limit = (2 * maxCovariance + 1e-12) / (largestMean - Math.max(...lowerMeans));
    const scale = maxCovariance / (largestMean - Math.min(...average));
    const start = Math.max(scale * 1e-4, Number.MIN_VALUE);
    for (let i = 0; i <= 120; i++) {
      const lambda = start * (limit / start) ** (i / 120);
      weights = minimumObjective(covariance, average, lambda, weights);
      const next = point(weights);
      if (next.return - frontier.at(-1).return > 1e-10) frontier.push(next);
    }
  }
  const correlation = count === 2 && covariance[0][0] > 0 && covariance[1][1] > 0
    ? covariance[0][1] / Math.sqrt(covariance[0][0] * covariance[1][1]) : null;
  return { frontier, assets, correlation };
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
  const smallSample = labels.length <= 5;
  assets.forEach((p, i) => {
    ctx.fillStyle = "#4b627a";
    ctx.beginPath(); ctx.arc(x(p.risk), y(p.return), 4, 0, 2 * Math.PI); ctx.fill();
    if (smallSample) ctx.fillText(labels[i], x(p.risk) - 18, y(p.return) - 8);
  });
  const minimum = frontier[0];
  ctx.fillStyle = "#245d93";
  ctx.beginPath(); ctx.arc(x(minimum.risk), y(minimum.return), 5, 0, 2 * Math.PI); ctx.fill();
}

function render() {
  const start = getPeriod("start"), end = getPeriod("end");
  const chosen = [...document.querySelectorAll("input[name=asset]:checked")].map(input => input.value);
  const allSectors = [...document.querySelectorAll("#sector-options input")].every(input => input.checked);
  el("sector-toggle").textContent = allSectors ? "Clear sectors" : "Select all sectors";
  const indices = chosen.map(ticker => data.assets.indexOf(ticker) + 1);
  const sample = data.rows.filter(row => row[0] >= start && row[0] <= end &&
    indices.every(i => Number.isFinite(row[i])));
  const error = !chosen.length ? "Select at least one asset."
    : !start || !end || start > end ? "Enter a valid period."
    : sample.length < 2 ? "Select a period with at least two shared monthly observations." : "";
  el("frontier-output").hidden = Boolean(error);
  el("sample-info").textContent = error || sample.length + " monthly observations · " +
    sample[0][0] + " to " + sample.at(-1)[0];
  if (error) { visible = undefined; return; }
  visible = { ...calculate(sample.map(row => indices.map(i => row[i])), chosen.length), labels: chosen };
  el("frontier-heading").textContent = chosen.length >= 2 ? "Efficient frontier" : "Single-asset result";
  el("correlation-row").hidden = chosen.length !== 2;
  el("correlation-result").textContent = visible.correlation === null ? "—" : visible.correlation.toFixed(3);
  const points = [["Minimum variance", visible.frontier[0]]];
  if (chosen.length > 1) points.push(["Highest sample return", visible.frontier.at(-1)]);
  renderWeights(chosen, visible.frontier[0].weights);
  renderTable(el("frontier-table"), points);
  renderTable(el("individual-table"), visible.assets.map((point, i) => [chosen[i], point]));
  drawChart();
}

function renderTable(table, points) {
  table.replaceChildren();
  const header = table.createTHead().insertRow();
  for (const label of ["Portfolio", "Ann. return", "Ann. volatility"]) {
    const th = document.createElement("th");
    th.scope = "col"; th.textContent = label; header.append(th);
  }
  const body = table.createTBody();
  for (const [name, point] of points) {
    const row = body.insertRow();
    for (const value of [name, percent(point.return), percent(point.risk)]) {
      row.insertCell().textContent = value;
    }
  }
}

function renderWeights(labels, weights) {
  const list = el("portfolio-weights");
  list.replaceChildren();
  for (const [index, label] of labels.entries()) {
    const name = document.createElement("dt");
    name.textContent = label;
    const weight = document.createElement("dd");
    weight.textContent = percent(weights[index]);
    list.append(name, weight);
  }
}

function getPeriod(side) {
  return el(side + "-year").value + "-" + el(side + "-month").value;
}

function setPeriod(side, date) {
  el(side + "-year").value = date.slice(0, 4);
  el(side + "-month").value = date.slice(5);
}

function updatePreset(preset) {
  const last = data.rows.at(-1)[0];
  if (preset === "max") {
    const selected = [...document.querySelectorAll("input[name=asset]:checked")]
      .map(input => data.assets.indexOf(input.value) + 1);
    const first = data.rows.find(row => selected.every(i => Number.isFinite(row[i])))[0];
    setPeriod("start", first);
  } else {
    const date = new Date(last + "-01T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() - Number(preset) * 12 + 1);
    setPeriod("start", date.toISOString().slice(0, 7));
  }
  setPeriod("end", last);
  for (const button of document.querySelectorAll("[data-period]")) {
    button.setAttribute("aria-pressed", String(button.dataset.period === preset));
  }
}

fetch("./monthly-returns.json").then(response => {
  if (!response.ok) throw Error("Dataset unavailable");
  return response.json();
}).then(dataset => {
  data = dataset;
  const firstYear = Number(data.rows[0][0].slice(0, 4));
  const lastYear = Number(data.rows.at(-1)[0].slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(Date.UTC(2020, i, 1)));
  for (const side of ["start", "end"]) {
    const years = el(side + "-year");
    for (let year = lastYear; year >= firstYear; year--) years.add(new Option(year, year));
    const picker = el(side + "-month");
    months.forEach((month, i) => picker.add(new Option(month, String(i + 1).padStart(2, "0"))));
  }
  el("frontier-controls").disabled = false;
  el("frontier-controls").addEventListener("input", event => {
    if (event.target.name === "asset" && el("period-max").getAttribute("aria-pressed") === "true") {
      updatePreset("max");
    } else if (event.target.tagName === "SELECT") {
      document.querySelectorAll("[data-period]").forEach(button => button.setAttribute("aria-pressed", "false"));
    }
    render();
  });
  for (const button of document.querySelectorAll("[data-period]")) button.addEventListener("click", () => {
    updatePreset(button.dataset.period);
    render();
  });
  el("sector-toggle").addEventListener("click", () => {
    const boxes = [...document.querySelectorAll("#sector-options input")];
    const selectAll = boxes.some(box => !box.checked);
    boxes.forEach(box => { box.checked = selectAll; });
    if (el("period-max").getAttribute("aria-pressed") === "true") updatePreset("max");
    render();
  });
  updatePreset("max");
  window.addEventListener("resize", drawChart);
  render();
}).catch(() => { el("sample-info").textContent = "Monthly returns could not be loaded. Reload the page to try again."; });
