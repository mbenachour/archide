import os
import requests

api_key = os.environ.get("OPENAI_API_TOKEN") or os.environ.get("OPENAI_API_KEY")
url = "https://api.openai.com/v1/chat/completions"

payload = {
    "model": "gpt-5-nano-2025-08-07",
    "messages": [
        {"role": "developer", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello! Reply with a single word."}
    ],
    "max_completion_tokens": 4096
}

r = requests.post(
    url,
    json=payload,
    headers={"Authorization": f"Bearer {api_key}"}
)

print(r.status_code)
print(r.json())
