import requests
res = requests.post("http://localhost:8000/search", json={"query": "hello", "user_id": "test_user", "top_k": 5})
print(res.status_code)
print(res.text)
