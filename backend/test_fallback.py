import sys
sys.path.append('c:/Users/llll/Documents/두인경매/주식투자/backend')
from main import _fallback_chart

res = _fallback_chart('7203.T', 'D', True, 'TSE')
print(res[:2] if res else "Empty list returned")
