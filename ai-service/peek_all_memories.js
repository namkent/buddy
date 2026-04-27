const userId = "102676487730026109049";
fetch("http://localhost:3005/v1/memories/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "User", user_id: userId, top_k: 50 })
})
.then(res => res.json())
.then(data => {
  console.log(`Found ${data.results.length} results.`);
  data.results.forEach(r => console.log(`- [${r.score.toFixed(2)}] ${r.memory}`));
})
.catch(err => console.error(err));
