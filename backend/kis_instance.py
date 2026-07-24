from kis_api import KISApiClient
import os

kis_client = None
try:
    kis_client = KISApiClient(
        app_key="PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2",
        app_secret="X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ=",
        account_no="44790516-01",
        is_mock=True
    )
    print("Global KIS API Client Initialized")
except Exception as e:
    print(f"Failed to initialize global KIS API Client: {e}")
