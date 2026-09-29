import re

with open("rsc_out.txt", "r", encoding="utf-8") as f:
    content = f.read()

# Find all korean words
kr_words = set(re.findall(r'[\uac00-\ud7a3]{2,}', content))
print("Korean words in RSC payload:", list(kr_words)[:30])

# Find all keys like "..." :
keys = set(re.findall(r'"([a-zA-Z0-9_]+)":', content))
print("Keys in RSC payload:", list(keys)[:40])
