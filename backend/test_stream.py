from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client()
interaction = client.interactions.create(
    agent="antigravity-preview-05-2026",
    input="Tell me a very short joke.",
    environment="remote",
    stream=True,
)

print(type(interaction))
for chunk in interaction:
    print("CHUNK:", repr(chunk))
