import requests
import json
import urllib.parse

# Open API key is already URL encoded
serviceKey = "R6zpn4dzyzuasYP5k7dxF1K+gv1J4nes6bhZCrVeZYkPlm++lz96SoaeBLlLvpqjsKyST6S0mmVtEa5zRctGng=="

url = f"https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey={urllib.parse.quote(serviceKey)}&resultType=json&numOfRows=5&itmsNm={urllib.parse.quote('삼성전자')}"
res = requests.get(url)
print(res.text[:1000])
