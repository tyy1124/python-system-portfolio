from dotenv import load_dotenv
load_dotenv("linkset.env")
import os
import requests
import json

CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

token_url = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"

headers = {
    "Content-Type": "application/x-www-form-urlencoded"
}

data = {
    "grant_type": "client_credentials",
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET
}

token_response = requests.post(token_url, headers=headers, data=data)

print("狀態碼：", token_response.status_code)
print("回傳內容：", token_response.text)

token_response.raise_for_status()

access_token = token_response.json()["access_token"]

api_url = "https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/TPE"

api_headers = {
    "Authorization": f"Bearer {access_token}",
    "Accept": "application/json"
}

response = requests.get(api_url, headers=api_headers)

print("航班 API 狀態碼：", response.status_code)
print(response.text[:500])

response.raise_for_status()

with open("tdx_tpe_flights.json", "w", encoding="utf-8") as file:
    json.dump(response.json(), file, ensure_ascii=False, indent=4)

print("成功存成 tdx_tpe_flights.json")