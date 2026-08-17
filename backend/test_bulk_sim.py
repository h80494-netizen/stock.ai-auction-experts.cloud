import sys
sys.path.append('c:/Users/llll/Documents/두인경매/주식투자/backend')
from etf_strategy import run_bulk_simulation

try:
    res = run_bulk_simulation("momentum")
    print(f"Success, got {len(res)} models")
    if len(res) > 0:
        print(f"Model 1 keys: {res[0].keys()}")
        print(f"Model 1 dates count: {len(res[0]['dates'])}")
        print(f"Model 1 strategy count: {len(res[0]['strategy'])}")
except Exception as e:
    import traceback
    traceback.print_exc()
