import json
from rnet import Client, Emulation, Method, redirect
from datetime import timedelta
from .PayloadHandler import build_everything
import random
from rnet import Client, Emulation, Method, redirect, Multipart, Part
from .SolutionTokenHandler import CHALLENGES

BANDWIDTH_CHALLENGE = "ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25"

class AwsSolver:

    def __init__(self, user_agent, domain):
        
        self.headers = {
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
            'user-agent': f'{user_agent}',
        }
        self.user_agent = user_agent
        if "www" not in domain:
            self.domain = f'www.{domain}'
        else:
            self.domain = domain

    def extract(self,html: str):
        goku_props = json.loads(html.split("window.gokuProps = ")[1].split(";")[0])
        host = html.split("src=\"https://")[1].split("/challenge.js")[0]
        return goku_props, host
    

    async def _get_final_values(self, host_url):

        response = await Client(emulation=Emulation.Chrome143, cookie_store=True, redirect=redirect.Policy.none()).request(method=getattr(Method, "GET"), url=f"https://{host_url}/inputs?client=browser", timeout=timedelta(seconds = 10), headers=self.headers)
        return await response.json()
    
    def _build_payload(self, input: dict, goku_props):
        verify = CHALLENGES[input["challenge_type"]]
        payload = build_everything(user_agent=self.user_agent)
        is_bandwidth = input["challenge_type"] == BANDWIDTH_CHALLENGE

        if is_bandwidth:
            solution_b64 = verify("", "", input["difficulty"])
            solution_metadata = {
                "challenge": input["challenge"],
                "solution": None,
                "signals": [{"name": "Zoey", "value": {"Present": payload["encrypted"]}}],
                "checksum": payload["checksum"],
                "client": "Browser",
                "domain": self.domain,
                "metrics": self._build_metrics(),
                "goku_props": goku_props
            }
            return {
                "_is_bandwidth": True,
                "solution_data": solution_b64,
                "solution_metadata": solution_metadata,
            }
    
    def _build_metrics(self):
        return [{"name":"2","value":0.09999999403953552,"unit":"2"},{"name":"100","value":0,"unit":"2"},{"name":"101","value":0,"unit":"2"},{"name":"102","value":1,"unit":"2"},{"name":"103","value":2,"unit":"2"},{"name":"104","value":0,"unit":"2"},{"name":"105","value":0,"unit":"2"},{"name":"106","value":0,"unit":"2"},{"name":"107","value":0,"unit":"2"},{"name":"108","value":0,"unit":"2"},{"name":"undefined","value":1,"unit":"2"},{"name":"110","value":0,"unit":"2"},{"name":"111","value":3,"unit":"2"},{"name":"112","value":0,"unit":"2"},{"name":"undefined","value":0,"unit":"2"},{"name":"3","value":0.6000000089406967,"unit":"2"},{"name":"7","value":1,"unit":"4"},{"name":"1","value":8.099999994039536,"unit":"2"},{"name":"4","value":418.29999999701977,"unit":"2"},{"name":"5","value":0.10000000894069672,"unit":"2"},{"name":"6","value":426.5,"unit":"2"},{"name":"8","value":0,"unit":"4"}]

    
    async def post_payload(self, payload, host_url):
        if payload.get("_is_bandwidth"):
            multipart = Multipart(
                Part(
                    name="solution_data",
                    value=payload["solution_data"].encode("utf-8")
                ),
                Part(
                    name="solution_metadata",
                    value=json.dumps(payload["solution_metadata"], separators=(",", ":")).encode("utf-8"),
                ),
            )
            response = await Client(emulation=Emulation.Chrome143).request(
                method=getattr(Method, "POST"),
                url=f"https://{host_url}/mp_verify",
                timeout=timedelta(seconds=10),
                headers=self.headers,
                multipart=multipart,
            )
        else:
            payload.pop("_is_bandwidth", None)
            response = await Client(emulation=Emulation.Chrome143).request(
                method=getattr(Method, "POST"),
                url=f"https://{host_url}/verify",
                timeout=timedelta(seconds=10),
                headers=self.headers,
                json=payload,
            )

        token = await response.json()
        return token


    
    async def solve(self, site_html: str):

        goku,host_url = self.extract(site_html)
        values = await self._get_final_values(host_url=host_url)
        payload = self._build_payload(values, goku)
        temp = await self.post_payload(payload, host_url)
        return temp["token"]



    

    


