curl -X POST http://localhost:3000/briefs/analyze-competitors \
     -H "Content-Type: application/json" \
     -d '{"keyword": "Violence against women and girls starts in our school system"}'


curl -X POST http://localhost:3000/briefs/analyze-keywords \
     -H "Content-Type: application/json" \
     -d '{"content": "Violence against women and girls starts in our school system"}'


curl -X POST http://localhost:3000/briefs \
  -H 'Content-Type: application/json' \
  -d '{
        "topic": "Violence against women and girls",
        "focus": "Government responses and survivor support",
        "goal": "Raise awareness about policy changes and the impact on survivors",
        "tone": "Informative & advocacy-driven",
      }'


curl -X POST http://localhost:3000/briefs \
  -H 'Content-Type: application/json' \
  -d '{
        "userId": "user123",
       
      }'


curl -X POST http://localhost:3000/briefs \
     -H "Content-Type: application/json" \
     -d "@ai-content-brief-generator/test/inputPayload.json"
