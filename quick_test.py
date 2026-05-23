#!/usr/bin/env python
"""Quick test of API endpoints"""
import requests
import json

BASE_URL = 'http://127.0.0.1:5000'

# Test /fetch-data
print('Testing /fetch-data...')
try:
    r = requests.get(f'{BASE_URL}/fetch-data', timeout=30)
    print(f'Status: {r.status_code}')
    data = r.json()
    print(f'Total fetched: {data.get("total_fetched", 0)} articles')
    print(f'Sources: {data.get("sources", 0)}')
    print(f'Is cached: {data.get("is_cached", False)}')
except Exception as e:
    print(f'Error: {e}')

# Test /results
print('\nTesting /results...')
try:
    r = requests.get(f'{BASE_URL}/results', timeout=30)
    print(f'Status: {r.status_code}')
    data = r.json()
    sentiment = data.get('sentiment', {})
    print(f'Total articles: {sentiment.get("total_articles", 0)}')
    overall = sentiment.get('overall', {})
    print(f'Positive: {overall.get("positive", 0)}')
    print(f'Neutral: {overall.get("neutral", 0)}')
    print(f'Negative: {overall.get("negative", 0)}')
except Exception as e:
    print(f'Error: {e}')

# Test /articles
print('\nTesting /articles...')
try:
    r = requests.get(f'{BASE_URL}/articles?limit=5', timeout=30)
    print(f'Status: {r.status_code}')
    data = r.json()
    print(f'Articles returned: {len(data)}')
    if data:
        print(f'First article: {data[0].get("title", "N/A")[:50]}...')
except Exception as e:
    print(f'Error: {e}')

print('\nDone!')
