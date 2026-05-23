#!/usr/bin/env python
"""Test live data fetching"""
import requests
import json
import time

BASE_URL = 'http://127.0.0.1:5000'

print("=" * 60)
print("Testing LIVE DATA FETCHING")
print("=" * 60)

# Test /fetch-data endpoint
print("\nCalling /fetch-data (getting LIVE data from sources)...")
start = time.time()
try:
    r = requests.get(f'{BASE_URL}/fetch-data', timeout=65)
    elapsed = time.time() - start
    print(f"Response received in {elapsed:.1f} seconds")
    print(f"HTTP Status: {r.status_code}")
    
    data = r.json()
    print(f"\nResponse data:")
    print(f"  Status: {data.get('status')}")
    print(f"  Total records: {data.get('total_fetched')}")
    print(f"  Is cached: {data.get('is_cached')}")
    print(f"  Sources: {data.get('sources')}")
    
    table = data.get('collection_table', [])
    if table:
        print(f"\nData by source ({len(table)} outlets):")
        for row in table:
            print(f"  {row['outlet']}: {row['count']} articles ({row['methods']})")
    else:
        print("  No data in collection table!")
        
except Exception as e:
    print(f"ERROR: {e}")

# Test /results endpoint
print("\n" + "=" * 60)
print("Getting analysis results...")
try:
    r = requests.get(f'{BASE_URL}/results', timeout=30)
    data = r.json()
    
    sentiment = data.get('sentiment', {})
    print(f"Total articles analyzed: {sentiment.get('total_articles')}")
    
    overall = sentiment.get('overall', {})
    if overall:
        print(f"\nSentiment breakdown:")
        print(f"  Positive: {overall.get('positive')} ({overall.get('pos_pct')}%)")
        print(f"  Neutral: {overall.get('neutral')} ({overall.get('neu_pct')}%)")
        print(f"  Negative: {overall.get('negative')} ({overall.get('neg_pct')}%)")
    
    platform_stats = sentiment.get('platform_stats', [])
    if platform_stats:
        print(f"\nPlatform breakdown ({len(platform_stats)} platforms):")
        for p in platform_stats[:5]:
            print(f"  {p['platform']}: {p['count']} articles")
            
except Exception as e:
    print(f"ERROR: {e}")

print("\n" + "=" * 60)
print("Test complete!")
