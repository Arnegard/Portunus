
import json
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

rot = Path(__file__).resolve().parent

text = (rot / "statistics-2025.js").read_text(encoding="utf-8-sig")
start = text.index("{")
slut = text.rfind("}") + 1
data = json.loads(text[start:slut])

def normalisera(text):
    text = unicodedata.normalize("NFKC", text)
    return " ".join(text.casefold().split())

def sok_omrade(namn):
    url = "https://bostad.stockholm.se/SokOmraden?" + urlencode({"s": namn})
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})

    with urlopen(request, timeout=15) as response:
        return json.load(response)

matchningar = {}
saknade = []
fel = []

for kommun, omraden in data["kommuner"].items():
    for omrade in omraden:
        nyckel = f"{kommun}|{omrade}"

        try:
            resultat = sok_omrade(omrade)

            traffar = [
                post for post in resultat
                if normalisera(post.get("Namn", "")) == normalisera(omrade)
                and normalisera(post.get("LangtNamn", "")) == normalisera(f"{kommun} - {omrade}")
                and post.get("Id")
            ]

            if len(traffar) >= 1:
                if len(traffar) == 1:
                    id_varde = traffar[0]["Id"]
                else:
                    id_varde = list(dict.fromkeys(post["Id"] for post in traffar))

                
                matchningar[nyckel] = {
                    "id": id_varde,
                    "namn": traffar[0]["LangtNamn"]
                }
                print("OK:", nyckel, id_varde)
            else:
                saknade.append(nyckel)
                print("SAKNAS:", nyckel)

        except Exception as e:
            fel.append(nyckel)
            print("FEL:", nyckel, str(e))

        time.sleep(0.3)

js = (
    "const bostadsOmraden = "
    + json.dumps(matchningar, ensure_ascii=False, indent=2)
    + ";\n\n"
    + """function skapaBostadslank(kommun, omrade) {
  const data = bostadsOmraden[kommun + "|" + omrade];

  if (!data) {
    return "https://bostad.stockholm.se/bostad/";
  }

  const url = new URL("https://bostad.stockholm.se/bostad/");
  
const idn = Array.isArray(data.id) ? data.id : [data.id];

url.searchParams.set("omrade", JSON.stringify(
  idn.map(id => ({
    value: id,
    name: data.namn
  }))
));


  return url.toString();
}
"""
)

utfil = rot / "bostadslankar.js"
if matchningar and not fel:
    utfil.write_text(js, encoding="utf-8")
    print("\nJavaScript-filen har uppdaterats.")
else:
    print("\nJavaScript-filen ändrades inte eftersom hämtningen var ofullständig.")

print("Matchade:", len(matchningar))
print("Saknade:", len(saknade))
print("Fel:", len(fel))

(rot / "bostadslankar-rapport.json").write_text(
    json.dumps({"saknade": saknade, "fel": fel}, ensure_ascii=False, indent=2),
    encoding="utf-8"
)
