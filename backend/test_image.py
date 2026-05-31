from google import genai


def test():
    try:
        client = genai.Client()
        models = client.models.list()
        for m in models:
            if "imagen" in m.name.lower():
                print(m.name)
    except Exception as e:
        print("Error:", e)


if __name__ == "__main__":
    test()
