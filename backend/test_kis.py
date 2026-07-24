import os
from kis_api import KISApiClient

def main():
    app_key = "PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2"
    app_secret = "X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ="
    account_no = "44790516-01"
    
    try:
        client = KISApiClient(app_key, app_secret, account_no, is_mock=True)
        print("토큰 발급 성공!")
        
        # Test getting price of Samsung Electronics
        price = client.get_current_price("005930")
        print(f"삼성전자 현재가: {price}원")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
