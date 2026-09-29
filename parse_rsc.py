import re
import json

with open("rsc_out.txt", "r", encoding="utf-8") as f:
    content = f.read()

# Find strings matching json array or dictionary with numbers
print("Searching for data patterns in rsc_out.txt...")

# Let's search for "localDate", "bizdate", "date", or numbers in quotes
matches = re.findall(r'\{[^{}]*"(?:date|bizdate|localDate|tradeDate)"[^{}]*\}', content)
print("Matches count:", len(matches))
for m in matches[:5]:
    print("Match:", m)

# Search for any json block containing numbers
json_blocks = re.findall(r'\[\s*\{[^{}]+\}\s*\]', content)
print("JSON blocks count:", len(json_blocks))
for jb in json_blocks[:5]:
    print("Block:", jb[:200])
