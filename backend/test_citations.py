from google import genai


def test():
    client = genai.Client()
    print("Testing interaction stream with Google Search...")

    # We use google search tool to force grounding citations
    interaction_stream = client.interactions.create(
        agent="antigravity-preview-05-2026",
        input="What is the current stock price of Google?",
        tools=[{"google_search": {}}],
    )

    for chunk in interaction_stream:
        print(f"--- EVENT: {chunk.event_type} ---")
        if chunk.event_type == "step.delta":
            print(dir(chunk.delta))
            if hasattr(chunk.delta, "text"):
                print("TEXT:", chunk.delta.text)
            if hasattr(chunk.delta, "model_call"):
                print("MODEL CALL")
            if hasattr(chunk.delta, "function_calls"):
                print("FUNCTION CALLS")
        elif hasattr(chunk, "step") and chunk.step:
            print("STEP DIR:", dir(chunk.step))


if __name__ == "__main__":
    test()
