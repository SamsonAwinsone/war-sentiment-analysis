#!/usr/bin/env python
"""Quick endpoint test script"""
import requests
import json
import time

BASE_URL = "http://127.0.0.1:5000"

print("=" * 70)
print("WAR SENTIMENT DASHBOARD - ENDPOINT TESTS")
print("=" * 70)

# Test 1: Index page
print("\n[1] Testing GET /")
try:
    r = requests.get(f"{BASE_URL}/", timeout=5)
    print(f"✓ Status: {r.status_code}")
    if "SentimentWatch" in r.text:
        print("✓ Dashboard HTML loaded successfully")
    else:
        print("⚠ HTML content unexpected")
except Exception as e:
    print(f"✗ Error: {e}")

# Test 2: Fetch data
print("\n[2] Testing GET /fetch-data")
try:
    r = requests.get(f"{BASE_URL}/fetch-data", timeout=60)
    data = r.json()
    print(f"✓ Status: {r.status_code}")
    print(f"✓ Total fetched: {data.get('total_fetched', 0)} articles")
    print(f"✓ Sources: {data.get('sources', 0)}")
    print(f"✓ Is cached: {data.get('is_cached', False)}")
    if data.get('status') in ['ok', 'ok_cached']:
        print("✓ Fetch successful")
    table = data.get('collection_table', [])
    if table:
        print(f"✓ Collection table has {len(table)} entries")
        print(f"  - Top source: {table[0]['outlet']} ({table[0]['count']} articles)")
except Exception as e:
    print(f"✗ Error: {e}")

# Test 3: Results
print("\n[3] Testing GET /results")
try:
    r = requests.get(f"{BASE_URL}/results", timeout=30)
    data = r.json()
    print(f"✓ Status: {r.status_code}")
    
    sentiment = data.get('sentiment', {})
    print(f"✓ Total articles: {sentiment.get('total_articles', 0)}")
    
    overall = sentiment.get('overall', {})
    print(f"✓ Sentiment breakdown:")
    print(f"  - Positive: {overall.get('positive', 0)} ({overall.get('pos_pct', 0)}%)")
    print(f"  - Neutral: {overall.get('neutral', 0)} ({overall.get('neu_pct', 0)}%)")
    print(f"  - Negative: {overall.get('negative', 0)} ({overall.get('neg_pct', 0)}%)")
    
    topics = data.get('topics', [])
    print(f"✓ Topics generated: {len(topics)}")
    if topics:
        print(f"  - Top topic: {topics[0]['label']}")
    
    platform_stats = sentiment.get('platform_stats', [])
    print(f"✓ Platforms analyzed: {len(platform_stats)}")
    if platform_stats:
        print(f"  - Top platform: {platform_stats[0]['platform']} ({platform_stats[0]['count']} articles)")
        print(f"    Sentiment: {platform_stats[0]['avg_compound']:.3f}")
    
    categories = sentiment.get('category_stats', [])
    print(f"✓ Categories: {len(categories)}")
    
except Exception as e:
    print(f"✗ Error: {e}")

# Test 4: Analyze
print("\n[4] Testing GET /analyze")
try:
    r = requests.get(f"{BASE_URL}/analyze", timeout=30)
    data = r.json()
    print(f"✓ Status: {r.status_code}")
    print(f"✓ Analysis status: {data.get('status', 'unknown')}")
except Exception as e:
    print(f"✗ Error: {e}")

print("\n" + "=" * 70)
print("ALL TESTS COMPLETED")
print("=" * 70)
print("\nDashboard ready at: http://127.0.0.1:5000")
