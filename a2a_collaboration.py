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
    """Agent that handles A2A standard JSON-RPC 2.0 requests for weather info."""

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

    def _make_error_response(self, message: str, req_id) -> dict:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": message},
            "id": req_id,
        }

    def handle_a2a_request(self, payload: dict) -> dict:
        """Handle incoming A2A tasks/send JSON-RPC request."""
        req_id = payload.get("id")
        if payload.get("jsonrpc") != "2.0" or payload.get("method") != "tasks/send":
            return self._make_error_response(
                "Invalid or unsupported JSON-RPC request", req_id
            )

        params = payload.get("params", {})
        task_id = params.get("taskId")
        message = params.get("message", {})
        parts = message.get("parts", [])

        # Extract prompt text from parts
        prompt_text = ""
        for part in parts:
            if part.get("type") == "text":
                prompt_text += part.get("text", "") + "\n"

        if not prompt_text:
            return self._make_error_response(
                "No text part provided in request parameters", req_id
            )

        print(
            f"[WeatherAgent] Received A2A tasks/send request (TaskId: {task_id}). Processing..."
        )

        # Call Gemini model
        response = self.chat.send_message(prompt_text)

        try:
            # Parse output
            result_text = (
                response.text.strip().replace("```json", "").replace("```", "")
            )
            json_data = json.loads(result_text)
        except Exception as e:
            json_data = {"error": f"Failed to parse weather: {e}", "raw": response.text}

        # Formulate formal A2A response task object
        result = {
            "id": task_id,
            "status": {"state": "completed", "timestamp": "2026-05-30T22:50:00Z"},
            "messages": [{"role": "agent", "content": json.dumps(json_data)}],
        }

        return {"jsonrpc": "2.0", "result": result, "id": req_id}


class CurrencyAgent:
    """Agent that handles A2A standard JSON-RPC 2.0 requests for currency exchange calculations."""

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

    def _make_error_response(self, message: str, req_id) -> dict:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": message},
            "id": req_id,
        }

    def handle_a2a_request(self, payload: dict) -> dict:
        """Handle incoming A2A tasks/send JSON-RPC request."""
        req_id = payload.get("id")
        if payload.get("jsonrpc") != "2.0" or payload.get("method") != "tasks/send":
            return self._make_error_response(
                "Invalid or unsupported JSON-RPC request", req_id
            )

        params = payload.get("params", {})
        task_id = params.get("taskId")
        message = params.get("message", {})
        parts = message.get("parts", [])

        # Extract inputs from parts (e.g., query + weather info)
        prompt_text = ""
        for part in parts:
            if part.get("type") == "text":
                prompt_text += part.get("text", "") + "\n"

        if not prompt_text:
            return self._make_error_response(
                "No text part provided in request parameters", req_id
            )

        print(
            f"[CurrencyAgent] Received A2A tasks/send request (TaskId: {task_id}). Processing..."
        )

        # Call Gemini model
        response = self.chat.send_message(prompt_text)

        try:
            # Parse output
            result_text = (
                response.text.strip().replace("```json", "").replace("```", "")
            )
            json_data = json.loads(result_text)
        except Exception as e:
            json_data = {
                "error": f"Failed to parse calculation: {e}",
                "raw": response.text,
            }

        # Formulate formal A2A response task object
        result = {
            "id": task_id,
            "status": {"state": "completed", "timestamp": "2026-05-30T22:50:02Z"},
            "messages": [{"role": "agent", "content": json.dumps(json_data)}],
        }

        return {"jsonrpc": "2.0", "result": result, "id": req_id}


class A2AOrchestrator:
    """Orchestrates Agent-to-Agent collaboration between WeatherAgent and CurrencyAgent using A2A JSON-RPC 2.0."""

    def __init__(self, client: genai.Client):
        self.client = client
        self.weather_agent = WeatherAgent(client)
        self.currency_agent = CurrencyAgent(client)

    def process(self, query: str, city: str) -> dict:
        print(f"\n[Orchestrator] Starting A2A collaboration for query: '{query}'")

        # 1. Format JSON-RPC tasks/send for Weather Agent
        weather_request = {
            "jsonrpc": "2.0",
            "method": "tasks/send",
            "params": {
                "taskId": "task-weather-001",
                "message": {
                    "role": "user",
                    "parts": [
                        {"type": "text", "text": f"What is the weather in {city}?"}
                    ],
                },
            },
            "id": 1,
        }

        print("\n--- SENDING TO WEATHER AGENT (A2A JSON-RPC Request) ---")
        print(json.dumps(weather_request, indent=2))

        # Invoke Weather Agent via handle_a2a_request
        weather_response = self.weather_agent.handle_a2a_request(weather_request)

        print("\n--- RECEIVED FROM WEATHER AGENT (A2A JSON-RPC Response) ---")
        print(json.dumps(weather_response, indent=2))

        if "error" in weather_response:
            return {
                "error": "WeatherAgent A2A communication failed",
                "details": weather_response,
            }

        # Extract weather report payload from the response message content
        weather_message_content = weather_response["result"]["messages"][0]["content"]

        # 2. Format JSON-RPC tasks/send for Currency Agent containing original query and weather report
        currency_request = {
            "jsonrpc": "2.0",
            "method": "tasks/send",
            "params": {
                "taskId": "task-currency-002",
                "message": {
                    "role": "user",
                    "parts": [
                        {"type": "text", "text": f"User Request: {query}"},
                        {
                            "type": "text",
                            "text": f"Weather Condition Report: {weather_message_content}",
                        },
                    ],
                },
            },
            "id": 2,
        }

        print("\n--- SENDING TO CURRENCY AGENT (A2A JSON-RPC Request) ---")
        print(json.dumps(currency_request, indent=2))

        # Invoke Currency Agent via handle_a2a_request
        currency_response = self.currency_agent.handle_a2a_request(currency_request)

        print("\n--- RECEIVED FROM CURRENCY AGENT (A2A JSON-RPC Response) ---")
        print(json.dumps(currency_response, indent=2))

        return {
            "query": query,
            "city": city,
            "weather_response": weather_response,
            "currency_response": currency_response,
        }


def main():
    parser = argparse.ArgumentParser(
        description="A2A JSON-RPC 2.0 Collaboration Runner"
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
    print("A2A COLLABORATION COMPLETED")
    print("==========================================")

    try:
        # Extract and print the final calculation result cleanly
        currency_content_str = result["currency_response"]["result"]["messages"][0][
            "content"
        ]
        currency_content = json.loads(currency_content_str)
        print("\nFinal Cost Calculation:")
        print(json.dumps(currency_content, indent=2))
    except Exception as e:
        print(f"Error outputting final result summary: {e}")

    print("==========================================\n")


if __name__ == "__main__":
    main()
