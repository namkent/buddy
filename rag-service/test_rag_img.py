import requests

res = requests.post('http://localhost:8000/rag/search', json={'query': 'xplatform module', 'top_k': 5})
data = res.json()
results = data.get('results', [])
print(f'Total results: {len(results)}')
for i, r in enumerate(results):
    has_img = bool(r.get('image_url'))
    img_url = r.get('image_url', 'None')
    print(f'Result {i+1}: has_image={has_img}, image_url={img_url}')
