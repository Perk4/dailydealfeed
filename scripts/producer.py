#!/usr/bin/env python3
"""
Producer Agent — Amazon Asset Collector
Ticket #30

Fetches product assets for video assembly.
Currently uses existing images from products.json.
TODO: Integrate Amazon Product API when access is granted.
"""

import json
import re
import sys
from pathlib import Path

PRODUCTS_FILE = Path(__file__).parent.parent / "products.json"
STORE_ID = "dailydealfeed-20"

def load_products():
    """Load products from JSON file."""
    with open(PRODUCTS_FILE) as f:
        data = json.load(f)
    return data["products"]

def extract_asin(amazon_url):
    """Extract ASIN from Amazon URL."""
    match = re.search(r'/dp/([A-Z0-9]{10})', amazon_url)
    return match.group(1) if match else None

def get_product_assets(product_id):
    """
    Get all assets needed for a product video.
    
    Returns:
    {
        "product_id": str,
        "product_name": str,
        "product_image_url": str,
        "amazon_link": str,
        "asin": str,
        "current_price": str,
        "tagline": str,
        "discount_code": str | None,
        "affiliate_tag": str,
        "assets_ready": bool,
        "notes": str
    }
    """
    products = load_products()
    
    # Find product by ID
    product = next((p for p in products if p["id"] == str(product_id)), None)
    if not product:
        return {"error": f"Product {product_id} not found"}
    
    asin = extract_asin(product["link"])
    
    # Build affiliate link with tag
    affiliate_link = product["link"]
    if STORE_ID not in affiliate_link:
        affiliate_link = f"{affiliate_link}?tag={STORE_ID}"
    
    return {
        "product_id": product["id"],
        "product_name": product["name"],
        "product_image_url": product["image"],  # Currently Unsplash, will be Amazon later
        "amazon_link": affiliate_link,
        "asin": asin,
        "current_price": product["price"],
        "tagline": product["tagline"],
        "discount_code": None,  # TODO: Integrate coupon API
        "affiliate_tag": STORE_ID,
        "assets_ready": True,
        "notes": "Using placeholder image. Amazon API integration pending."
    }

def get_all_assets():
    """Get assets for all products."""
    products = load_products()
    return [get_product_assets(p["id"]) for p in products]

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Get specific product
        product_id = sys.argv[1]
        result = get_product_assets(product_id)
    else:
        # Get first featured product as demo
        products = load_products()
        featured = next((p for p in products if p.get("featured")), products[0])
        result = get_product_assets(featured["id"])
    
    print(json.dumps(result, indent=2))
