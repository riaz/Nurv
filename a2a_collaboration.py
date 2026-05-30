#!/usr/bin/env python3
import sys
import json
import argparse
import warnings
from google import genai
from google.genai import types
from dotenv import load_dotenv, find_dotenv

# Suppress experimental warnings
warnings.filterwarnings("ignore", category=UserWarning)

# Load environment variables
load_dotenv(find_dotenv())


def get_client() -> genai.Client:
    """Initialize the Google GenAI client."""
    try:
        return genai.Client()
    except Exception as e:
        print(f"Error initializing GenAI Client: {e}", file=sys.stderr)
        print(
            "Please ensure GEMINI_API_KEY is configured in your .env file.",
            file=sys.stderr,
        )
        sys.exit(1)


class WeatherAgent:
    """Agent that returns hardcoded weather information for specific cities in JSON format."""

    SYSTEM_INSTRUCTION = """
    You are a Weather Agent. You have access to hardcoded weather information for the following cities:
    - Tokyo: Raining, 15°C
    - New York: Sunny, 22°C
    - London: Cloudy, 12°C

    When asked about the weather of a city, search your hardcoded database and return a JSON formatted string containing:
    {
      "city": "<city_name>",
      "condition": "<raining/sunny/cloudy>",
      "temperature": "<temp_in_celsius>"
    }

    If the city is not in your database, return:
    {
      "error": "City not found in database"
    }

    Provide ONLY the raw JSON string without markdown code block formatting (no ```json).
    """

    def __init__(self, client: genai.Client):
        self.chat = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=self.SYSTEM_INSTRUCTION,
                temperature=0.1,
            ),
        )

    def get_weather(self, city: str) -> dict:
        print(f"[WeatherAgent] Processing weather query for: '{city}'...")
        prompt = f"What is the weather in {city}?"
        response = self.chat.send_message(prompt)

        try:
            # Clean up potential markdown formatting
            text = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(text)
        except Exception as e:
            return {
                "error": f"Failed to parse Weather Agent response: {e}",
                "raw_response": response.text,
            }


class CurrencyAgent:
    """Agent that performs currency exchange calculations and applies surcharges based on weather."""

    SYSTEM_INSTRUCTION = """
    You are a Currency Exchange Agent. You have access to the following exchange rates:
    - 1 USD = 150 JPY
    - 1 USD = 0.80 GBP
    - 1 USD = 0.90 EUR

    When asked to perform a currency conversion or calculate a total cost under a specific weather condition, perform the math and return a JSON formatted string containing:
    {
      "original_amount": <amount>,
      "original_currency": "<currency>",
      "target_currency": "<currency>",
      "converted_amount": <amount>,
      "weather_surcharge_applied": <true/false>,
      "calculation_steps": "<step-by-step description of how the conversion and surcharge were applied>"
    }

    Calculation Rules:
    1. If the weather report shows the condition in the destination city is 'raining', apply a flat 10 USD taxi surcharge.
       Convert this 10 USD surcharge to the original currency before adding it to the original amount, then convert the total.
       - e.g., if original currency is JPY, 10 USD = 1500 JPY surcharge. Total = (original_amount + 1500) JPY.
    2. Convert the total to USD.

    Provide ONLY the raw JSON string without markdown code block formatting (no ```json).
    """

    def __init__(self, client: genai.Client):
        self.chat = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=self.SYSTEM_INSTRUCTION,
                temperature=0.1,
            ),
        )

    def calculate_cost(self, original_query: str, weather_report: dict) -> dict:
        print(
            f"[CurrencyAgent] Calculating cost based on weather report: {weather_report}..."
        )
        prompt = f"""
        User Request: {original_query}
        Weather Report: {json.dumps(weather_report)}

        Calculate the total cost and convert it to USD.
        """
        response = self.chat.send_message(prompt)

        try:
            text = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(text)
        except Exception as e:
            return {
                "error": f"Failed to parse Currency Agent response: {e}",
                "raw_response": response.text,
            }


class A2AOrchestrator:
    """Orchestrates Agent-to-Agent collaboration between WeatherAgent and CurrencyAgent."""

    def __init__(self, client: genai.Client):
        self.client = client
        self.weather_agent = WeatherAgent(client)
        self.currency_agent = CurrencyAgent(client)

    def process(self, query: str, city: str) -> dict:
        print(f"\n[Orchestrator] Starting A2A collaboration for query: '{query}'")

        # Step 1: Query the WeatherAgent
        weather_info = self.weather_agent.get_weather(city)
        print(f"[Orchestrator] WeatherAgent returned: {weather_info}")

        if "error" in weather_info:
            return {"error": "WeatherAgent failed", "details": weather_info}

        # Step 2: Pass original query and weather report to CurrencyAgent
        calculation_result = self.currency_agent.calculate_cost(query, weather_info)
        print(f"[Orchestrator] CurrencyAgent returned: {calculation_result}")

        # Step 3: Combine results
        return {
            "query": query,
            "weather_report": weather_info,
            "calculation_result": calculation_result,
        }


def main():
    parser = argparse.ArgumentParser(
        description="Agent-to-Agent (A2A) Collaboration Runner"
    )
    parser.add_argument(
        "--query",
        type=str,
        default="I want to eat a 3000 JPY lunch in Tokyo. If it's raining, I need a taxi. What is the total cost in USD?",
        help="The query description containing costs and location.",
    )
    parser.add_argument(
        "--city",
        type=str,
        default="Tokyo",
        help="The city location referenced in the query.",
    )

    args = parser.parse_args()

    client = get_client()
    orchestrator = A2AOrchestrator(client)

    result = orchestrator.process(args.query, args.city)

    print("\n==========================================")
    print("A2A COLLABORATION RESULT")
    print("==========================================")
    print(json.dumps(result, indent=2))
    print("==========================================\n")


if __name__ == "__main__":
    main()
