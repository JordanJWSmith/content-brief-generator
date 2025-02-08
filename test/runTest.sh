curl -X POST http://localhost:3000/briefs/analyze-competitors \
     -H "Content-Type: application/json" \
     -d '{"keyword": "Violence against women and girls starts in our school system"}'


curl -X POST http://localhost:3000/briefs/analyze-keywords \
     -H "Content-Type: application/json" \
     -d '{"content": "Violence against women and girls starts in our school system"}'


curl -X POST http://localhost:3000/briefs \
  -H 'Content-Type: application/json' \
  -d '{
        "userId": "user123",
        "topic": "Tech in UK Politics",
        "content": "The use of tech in UK politics can be a good driving force for change, but does not come without risks around security, deliverability and scale.",
        "keyword": "Tech in UK Politics"
      }'


curl -X POST http://localhost:3000/briefs \
  -H 'Content-Type: application/json' \
  -d '{
        "userId": "user123",
        "topic": "Violence against women and girls",
        "content": "Violence against women and girls is an endemic and growing problem in the UK. The scale of it is often masked by treating incidents as one-off acts, or downplayed by treating perpetrators as monsters or spurned lovers.",
        "keyword": "Violence against women and girls"
      }'
