import sys

try:
    import pykrx
    print("pykrx available")
except ImportError:
    print("pykrx not installed")

try:
    import FinanceDataReader as fdr
    print("FinanceDataReader available")
except ImportError:
    print("FinanceDataReader not installed")
