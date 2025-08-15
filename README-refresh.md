# Clean Plate Data Refresh

This repo auto-generates:
- `v1/hazards.json` from OFF additives taxonomy + conservative overrides
- `v1/regulatory.json` from curated, credible region rules
- `v1/ingredients.json` from OFF ingredients taxonomy

Sources:
- Open Food Facts taxonomies (ODbL):  
  - Additives: https://static.openfoodfacts.org/data/taxonomies/additives.json  
  - Ingredients: https://static.openfoodfacts.org/data/taxonomies/ingredients.json
- Key regulatory anchors:
  - FDA final rule removing BVO authorization (2024)
  - EU removal of E171 (titanium dioxide) as a food additive (2022)
  - Health Canada BVO prohibition (2024)
  - California AB 418 (2023) effective 2027-01-01

Update locally:

