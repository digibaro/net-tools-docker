Mounted read-only at `/data` in the `api` container. Put optional data files here.

## GeoIP (IP geolocation tool, REP-01)

The tool is enabled when a city database is present or `IPINFO_TOKEN` is set (ipinfo.io is
then used as the source); it is shown as unavailable (`data_missing`) otherwise. The API looks for these names, first match wins:

| Kind | File names | Override |
|---|---|---|
| City (required) | `GeoLite2-City.mmdb`, `dbip-city-lite.mmdb`, `GeoIP2-City.mmdb` | `GEOIP_CITY_DB` |
| ASN (optional) | `GeoLite2-ASN.mmdb`, `dbip-asn-lite.mmdb`, `GeoIP2-ISP.mmdb` | `GEOIP_ASN_DB` |

Without an ASN database the network is looked up through Team Cymru's DNS service.

- MaxMind GeoLite2: free account and licence key, <https://dev.maxmind.com/geoip/geolite2-free-geolocation-data>
  (`geoipupdate` can refresh the files in place).
- DB-IP Lite (CC BY 4.0, no account): <https://db-ip.com/db/lite.php>.

Replacing a file is picked up within 30 seconds, without a restart. A path set explicitly
through `GEOIP_*_DB` that does not exist makes `/api/readyz` fail.

## Status feeds and quick links (DASH-01, DASH-02)

| File | Tool | Override | Example |
|---|---|---|---|
| `status-feeds.yml` | Cloud service status | `STATUS_FEEDS_FILE` | [status-feeds.example.yml](status-feeds.example.yml) |
| `links.yml` | Quick links | `LINKS_FILE` | [links.example.yml](links.example.yml) |

Without a file the built-in lists are used. The files are read when the api container starts
(`docker compose restart api` after a change). A file that cannot be parsed is ignored: the tool
shows the built-in list with a warning, and the api log says what is wrong.
