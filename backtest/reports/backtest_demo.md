# Backtest Report — SYNTHETIC DEMO DATA (not real results)

Scored forecasts: **180**

| Forecaster | n | Brier ↓ | Log-loss ↓ | Acc@0.5 | Bias |
|---|---|---|---|---|---|
| calibrated-bot | 60 | 0.1775 | 0.5367 | 0.75 | 0.0071 |
| coin-flip | 60 | 0.25 | 0.6931 | 0.5 | 0.0 |
| overconfident-bot | 60 | 0.2537 | 0.7439 | 0.6333 | 0.0315 |

## Flags

- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-017", "prob": 0.8376, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-033", "prob": 0.8838, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-calibrated-bot-034", "prob": 0.8519, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-034", "prob": 0.9502, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-036", "prob": 0.9853, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-043", "prob": 0.1432, "outcome": 1}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-calibrated-bot-051", "prob": 0.8927, "outcome": 0}
- `extreme-miss`: {"type": "extreme-miss", "forecast_id": "SYN-overconfident-bot-053", "prob": 0.8389, "outcome": 0}

_Lower Brier and log-loss are better. Bias = mean forecast − base rate._
