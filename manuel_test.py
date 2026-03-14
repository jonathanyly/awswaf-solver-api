from rnet import Client, Emulation, Method, redirect
import httpx
import asyncio
from datetime import timedelta
from AWSSolver.Solver import AwsSolver

URL = "https://www.binance.com/en"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
HEADERS = {
            "connection": "keep-alive",
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'priority': 'u=0, i',
            'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'same-origin',
            'upgrade-insecure-requests': '1',
            'user-agent': f'{USER_AGENT}',
        }
async def main():
    
    client = Client(emulation=Emulation.Chrome143, cookie_store=True, redirect=redirect.Policy.limited(max=5))
    response = await client.request(method=getattr(Method, "GET"), url=f"{URL}", timeout=timedelta(seconds = 10), headers=HEADERS)
    text = await response.text()
    print(f"[+] Got HTML ({len(text)} bytes)")

    solver = AwsSolver(user_agent=USER_AGENT, domain="www.binance.com")
    token = await solver.solve(text)

    print(f"[+] Token: {token}")
    cookies = {
        "aws-waf-token": token
    }
    response = await client.request(method=getattr(Method, "GET"), url=f"{URL}", timeout=timedelta(seconds = 10), headers=HEADERS, cookies = cookies)

    print(f"[+] Status: {response.status.as_int()}")
    print(f"[+] Response: {text[:500]}")

if __name__ == "__main__":
    asyncio.run(main())