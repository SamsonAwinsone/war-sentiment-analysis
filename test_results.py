#!/usr/bin/env python
"""Check if data is available on /results endpoint"""
import requests

r = requests.get('http://127.0.0.1:5000/results', timeout=10)
if r.status_code == 200:
    data = r.json()
    sentiment = data.get('sentiment', {})
    print(f"Articles: {sentiment.get('total_articles')}")
    overall = sentiment.get('overall', {})
    print(f"Positive: {overall.get('positive')}")
    print(f"Neutral: {overall.get('neutral')}")
    print(f"Negative: {overall.get('negative')}")
else:
    print(f"Error: {r.status_code}")
    print(r.text)
