import difflib
import logging
from apps.catalog.models import Product

logger = logging.getLogger(__name__)

def find_product_by_name(name: str, threshold: float = 0.5):
    """
    Finds the best matching product in the active catalog using fuzzy logic.
    """
    products = Product.objects.filter(active=True)
    
    best_match = None
    best_score = 0
    
    # Normalize input
    search_name = name.lower().strip()
    
    for product in products:
        # Normalize product name
        prod_name = product.name.lower().strip()
        
        # Calculate similarity score
        score = difflib.SequenceMatcher(None, search_name, prod_name).ratio()
        
        # Exact match boost
        if search_name in prod_name or prod_name in search_name:
            score += 0.2
            
        if score > best_score:
            best_score = score
            best_match = product

    if best_score >= threshold:
        logger.info(f"Fuzzy Match: '{name}' -> '{best_match.name}' (Score: {best_score:.2f})")
        return best_match
    
    logger.warning(f"No fuzzy match for '{name}' (Best score: {best_score:.2f})")
    return None
