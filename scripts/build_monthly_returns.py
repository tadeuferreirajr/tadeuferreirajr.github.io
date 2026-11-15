"""Build the portfolio demo dataset from the committed daily adjusted closes."""
import csv
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TICKERS = ("VTI", "GLD")
DATA = ROOT / "data" / "portfolio-construction"
OUTPUT = ROOT / "docs" / "projects" / "monte-carlo-portfolio-risk"


def read_prices(ticker):
    with (DATA / f"{ticker}.csv").open(newline="") as file:
        return {
            date.fromisoformat(row["date"]): float(row["adjusted_close"])
            for row in csv.DictReader(file)
        }


def monthly_returns(prices, cutoff):
    closes = {}
    for day, close in sorted(prices.items()):
        month = day.isoformat()[:7]
        if month < cutoff:
            closes[month] = close

    returns = {}
    for ((previous, start), (current, end)) in zip(closes.items(), list(closes.items())[1:]):
        previous_year, previous_month = map(int, previous.split("-"))
        current_year, current_month = map(int, current.split("-"))
        if current_year * 12 + current_month - (previous_year * 12 + previous_month) != 1:
            raise ValueError(f"Missing month between {previous} and {current}")
        returns[current] = end / start - 1
    return returns


if __name__ == "__main__":
    prices = {ticker: read_prices(ticker) for ticker in TICKERS}
    cutoff = min(max(series) for series in prices.values()).isoformat()[:7]
    returns = {ticker: monthly_returns(series, cutoff) for ticker, series in prices.items()}
    months = sorted(set().union(*(series.keys() for series in returns.values())))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    values = [[month, *(returns[ticker].get(month) for ticker in TICKERS)] for month in months]
    (OUTPUT / "monthly-returns.json").write_text(json.dumps({"assets": TICKERS, "rows": values}) + "\n")
    with (OUTPUT / "monthly-returns.csv").open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["month", *TICKERS])
        writer.writerows(values)
