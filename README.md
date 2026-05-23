# War Sentiment Analysis Dashboard
## US / Israel–Iran Conflict — Real-Time NLP System

A live sentiment analysis and topic modeling system built with **Python (Flask)** and
**HTML/CSS/JavaScript**, collecting real-time data from international news outlets and
social media platforms.

---

## Project Structure

```
war_sentiment/
├── app.py                  ← Flask backend (all NLP + data collection)
├── requirements.txt        ← Python dependencies
├── README.md
├── templates/
│   └── index.html          ← Dashboard UI (single-page)
├── static/
│   ├── css/style.css       ← Dark intelligence-briefing theme
│   └── js/script.js        ← Real-time Chart.js dashboard logic
└── data/                   ← (auto-created) cached results
```

---

## Quick Start (5 minutes)

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

> Python 3.10+ recommended.

### 2. Download NLTK data

```python
python -c "import nltk; nltk.download('stopwords'); nltk.download('punkt'); nltk.download('punkt_tab')"
```

### 3. (Optional) Add API keys for extra data sources

Open `app.py` and set environment variables **or** edit directly:

| Source          | How to get key                                  | What it unlocks               |
|-----------------|-------------------------------------------------|-------------------------------|
| **Reddit**      | https://www.reddit.com/prefs/apps → create app | r/worldnews posts + comments  |
| **YouTube**     | https://console.cloud.google.com → YouTube API | BBC/AJ video comments         |

```bash
# Linux/macOS
export REDDIT_CLIENT_ID="your_id"
export REDDIT_CLIENT_SECRET="your_secret"
export YOUTUBE_API_KEY="your_key"

# Windows PowerShell
$env:REDDIT_CLIENT_ID="your_id"
$env:REDDIT_CLIENT_SECRET="your_secret"
$env:YOUTUBE_API_KEY="your_key"
```

> **Without API keys**: The system still collects live articles via 14 RSS feeds
> (BBC, Al Jazeera, Reuters, RT News, Google News ×4, Sky News, Guardian, DW,
> France 24) and direct web scraping — **no keys required**.

### 4. Run the server

```bash
python app.py
```

### 5. Open the dashboard

```
http://127.0.0.1:5000
```

Click **"Refresh Data"** in the sidebar to trigger live collection.

---

## Live Data Sources

| Source            | Method                     | Key Required? |
|-------------------|----------------------------|---------------|
| BBC Middle East   | RSS Feed                   | No            |
| BBC World         | RSS Feed                   | No            |
| Al Jazeera        | RSS Feed + Web Scraping    | No            |
| Reuters           | RSS Feed + Web Scraping    | No            |
| RT News           | RSS Feed + Web Scraping    | No            |
| Google News ×4    | RSS Search API             | No            |
| Sky News          | RSS Feed                   | No            |
| The Guardian      | RSS Feed                   | No            |
| Deutsche Welle    | RSS Feed                   | No            |
| France 24         | RSS Feed                   | No            |
| Reddit (5 subs)   | PRAW Reddit API            | Yes (free)    |
| YouTube comments  | YouTube Data API v3        | Yes (free)    |

---

## 🔌 Flask API Endpoints

| Endpoint       | Method | Description                                                  |
|----------------|--------|--------------------------------------------------------------|
| `/`            | GET    | Serves the dashboard HTML                                    |
| `/fetch-data`  | GET    | Triggers fresh data collection from all sources              |
| `/analyze`     | GET    | Re-runs NLP pipeline on collected data                       |
| `/results`     | GET    | Returns full JSON: collection table + topics + sentiment     |

---

## NLP Pipeline

### Preprocessing
1. **Lowercase** all text
2. **Strip HTML tags** (BeautifulSoup)
3. **Remove URLs** (regex)
4. **Remove non-alphabetic characters**
5. **Tokenize** (NLTK `word_tokenize`)
6. **Remove stopwords** (NLTK English + custom domain stoplist)
7. **Filter tokens** < 3 characters

### Topic Modeling — LDA (gensim)
- Dictionary built from preprocessed corpus
- Extreme-frequency tokens filtered (`no_below=2`, `no_above=0.85`)
- **7 topics**, `passes=10`, `alpha=auto` (asymmetric prior)
- Topics manually labelled: Military Operations, Geopolitical Tensions, Nuclear Programme, Economic Impact, Humanitarian Crisis, Media Narratives, Diplomatic Relations

### Sentiment Analysis — VADER
- Applied to lightly-cleaned text (preserving punctuation for VADER heuristics)
- Compound score: −1 (most negative) → +1 (most positive)
- Classification: Positive ≥ 0.05 | Negative ≤ −0.05 | Neutral otherwise
- Aggregated by: **platform**, **thematic angle**, overall distribution

### Thematic Classification (5 Angles)
Articles are assigned to one of five thematic categories via keyword-density scoring:
1. Military Operations & Strategy
2. Geopolitical Tensions
3. Economic Impact (oil, Strait of Hormuz)
4. Media Narratives & Propaganda
5. Support / Opposition to War

---

## Dashboard Features

- **KPI cards** — total articles, positive/neutral/negative counts
- **Live collection table** — per-source counts, date range, method
- **Topic modeling** — keyword chips, topic distribution bar chart
- **Platform sentiment bar** — average compound score per outlet
- **Sentiment pie/doughnut** — overall distribution
- **Stacked bar** — pos/neu/neg count by platform
- **Thematic cards** — sentiment score + proportion bar per theme
- **Radar chart** — multi-metric cross-platform comparison
- **Refresh button** — triggers new live collection instantly
- **Auto-refresh** — every 60 seconds (toggle in sidebar)
- **Platform filter** — filter charts to a single source

---

## Known Limitations

| Limitation | Explanation |
|---|---|
| Twitter/X | Requires paid API ($100+/mo). Not included. Reddit used as alternative. |
| Facebook | Meta Graph API requires business verification. Not accessible. |
| Full article text | RSS feeds provide summaries only. Full text requires Newspaper3k or paid APIs. |
| Multilingual content | VADER is English-only. Arabic/Farsi/Hebrew articles are filtered out. |
| RT News access | May be geo-blocked in some regions (EU). Use VPN if needed. |
| API rate limits | YouTube: 10,000 units/day. Reddit: 60 requests/minute. |

---

## Academic Notes

### Why VADER (unsupervised)?
VADER requires no labelled training data and is calibrated for short texts and
social media. It captures valence modifiers (e.g. "very", "not"), emoji sentiment,
and ALL-CAPS emphasis. For a supervised baseline, annotate 500+ articles and train
a logistic regression or fine-tuned BERT classifier.

### Why LDA?
LDA is interpretable and computationally efficient. The bag-of-words assumption means
word order is lost — "not war" and "war" contribute the same signal. BERTopic (if
disk space permits) would produce more coherent topics by leveraging sentence
embeddings.

### Preprocessing trade-offs
Removing negations ("not good") inflates positive sentiment scores. Custom stopword
lists must be domain-specific: "said", "reported", "reuters" are not informative but
"sanctions", "strike" are critical and must be retained.
