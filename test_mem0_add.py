import requests
res = requests.post("http://localhost:8000/memories", json={"messages": [{"role": "user", "content": "I like apple"}], "user_id": "test_user"})
print(res.status_code)
print(res.text)
