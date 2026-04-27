const userId = "102676487730026109049";
fetch("http://localhost:3005/v1/memories/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "Tô Lâm", user_id: userId, top_k: 20 })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
