#!/usr/bin/env python3
import sys
import argparse
from typing import List
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from a local .env file
load_dotenv()


# Define structured Pydantic models for the restaurant menu
class MenuItem(BaseModel):
    name: str = Field(description="The name of the dish or drink.")
    description: str = Field(
        description="An appetizing, sensory-rich description of the item."
    )
    price: float = Field(description="The price of the item in USD.")
    spicy_level: int = Field(
        description="Spiciness level on a scale from 0 (not spicy) to 3 (very spicy).",
        ge=0,
        le=3,
    )
    allergens: List[str] = Field(
        description="List of common allergens (e.g., dairy, nuts, gluten, soy, shellfish) or empty list if none."
    )


class MenuCategory(BaseModel):
    category_name: str = Field(
        description="The category title (e.g., Appetizers, Entrées, Desserts, Signature Cocktails)."
    )
    items: List[MenuItem] = Field(
        description="The list of items under this menu category."
    )


class RestaurantMenu(BaseModel):
    restaurant_name: str = Field(
        description="A creative and catchy name for the restaurant."
    )
    theme: str = Field(
        description="The core theme, vibe, or culinary concept of the restaurant."
    )
    location: str = Field(
        description="A fictional but realistic location matching the theme (e.g., 'Neo-Tokyo Sector 4', 'A floating sky-dock in New London')."
    )
    currency: str = Field(default="USD", description="Currency symbol or abbreviation.")
    categories: List[MenuCategory] = Field(
        description="The categories making up the restaurant menu."
    )


def get_client() -> genai.Client:
    """Initialize the Google GenAI client, letting it automatically resolve credentials."""
    try:
        return genai.Client()
    except Exception as e:
        print(f"Error initializing GenAI Client: {e}", file=sys.stderr)
        print(
            "Please ensure GEMINI_API_KEY or GOOGLE_API_KEY is set in your environment.",
            file=sys.stderr,
        )
        sys.exit(1)


def generate_structured_menu(client: genai.Client, theme: str) -> RestaurantMenu:
    """Generate a fully structured menu matching the Pydantic schema using Gemini 2.5."""
    prompt = f"""
    Create a highly creative, rich, and detailed restaurant menu based on the following theme: '{theme}'.
    Ensure the item names are creative, the descriptions are mouth-watering, and the prices are realistic.
    Include a variety of appetizers, main courses, desserts, and beverages.
    """

    print(f"Generating structured menu for theme: '{theme}' using gemini-2.5-flash...")

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RestaurantMenu,
            temperature=1.0,
        ),
    )

    # Parse and validate using Pydantic
    return RestaurantMenu.model_validate_json(response.text)


def generate_agent_menu(client: genai.Client, theme: str) -> str:
    """Generate a menu using the managed agent (interactions API) with fallback."""
    prompt = f"""
    You are an autonomous chef and restaurant consultant agent.
    Create a comprehensive and creative restaurant concept and menu based on the theme: '{theme}'.

    Tasks to perform:
    1. Research authentic ingredients and styles that match the theme.
    2. Write a detailed profile for the restaurant (ambiance, signature styles).
    3. Generate the menu with categories, items, descriptions, prices, spice levels, and allergens.
    4. Format the final output as a beautiful, rich markdown document.
    """

    print(
        f"Contacting managed agent 'antigravity-preview-05-2026' for theme: '{theme}'..."
    )
    try:
        interaction = client.interactions.create(
            agent="antigravity-preview-05-2026",
            input=prompt,
        )

        # Extract output from interaction steps or fallback text
        if hasattr(interaction, "steps") and interaction.steps:
            for step in reversed(interaction.steps):
                if hasattr(step, "content") and step.content:
                    if isinstance(step.content, list):
                        text_parts = []
                        for part in step.content:
                            if hasattr(part, "text"):
                                text_parts.append(part.text)
                            elif isinstance(part, str):
                                text_parts.append(part)
                        if text_parts:
                            return "\n".join(text_parts)
                    elif hasattr(step.content, "text"):
                        return step.content.text

        if hasattr(interaction, "output_text") and interaction.output_text:
            return interaction.output_text

        return str(interaction)

    except Exception as e:
        print(f"\n[Note] Managed Agent API is unavailable or returned an error: {e}")
        print("Falling back to standard Gemini 2.5 Model generation...")

        fallback_prompt = f"""
        {prompt}
        Format the output clearly as Markdown.
        """
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=fallback_prompt,
        )
        return response.text


def main():
    parser = argparse.ArgumentParser(
        description="Managed Agent and Structured Generator for Fake Restaurant Menus"
    )
    parser.add_argument(
        "--theme",
        type=str,
        default="Cyberpunk Neo-Tokyo Noodle Bar",
        help="The theme or concept of the restaurant menu to generate.",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["structured", "agent"],
        default="structured",
        help="Generation mode: 'structured' (Pydantic validated JSON) or 'agent' (Managed agent markdown report).",
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Optional file path to save the generated menu output.",
    )

    args = parser.parse_args()

    client = get_client()

    if args.mode == "structured":
        try:
            menu = generate_structured_menu(client, args.theme)
            menu_json = menu.model_dump_json(indent=2)
            print("\nSuccessfully Generated Structured Menu:")
            print(menu_json)

            if args.output:
                with open(args.output, "w") as f:
                    f.write(menu_json)
                print(f"\nSaved structured menu to {args.output}")
        except Exception as e:
            print(f"Error generating structured menu: {e}", file=sys.stderr)
            sys.exit(1)

    elif args.mode == "agent":
        try:
            menu_report = generate_agent_menu(client, args.theme)
            print("\nSuccessfully Generated Agent Menu Concept:\n")
            print(menu_report)

            if args.output:
                with open(args.output, "w") as f:
                    f.write(menu_report)
                print(f"\nSaved agent menu report to {args.output}")
        except Exception as e:
            print(f"Error generating agent menu: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
