import urllib.request, json, sys
urls = ["http://127.0.0.1:5000/fetch-status",
        "http://127.0.0.1:5000/results",
        "http://127.0.0.1:5000/fetch-data"]
for u in urls:
    try:
        with urllib.request.urlopen(u, timeout=10) as r:
            b = r.read()
            print('\n---', u, '---')
            try:
                j = json.loads(b.decode('utf-8'))
                print(json.dumps(j, indent=2)[:4000])
            except Exception:
                print(b.decode('utf-8')[:4000])
    except Exception as e:
        print('\nERR', u, e)
        sys.exit(1)
print('\nOK')
