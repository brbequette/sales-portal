# Telegram background worker routing

The employee-session proxy redirected the scheduled Telegram worker invocation
to the login page. The dispatcher followed the redirect without checking the
response, leaving reply jobs pending.

The exact native background-function path now passes through the session proxy.
The function still requires POST and a valid worker secret before processing a
job. Other function paths, nearby paths, and portal pages retain their existing
session checks. Dispatch refuses redirects and requires Netlify's HTTP 202
background-invocation acknowledgement.

Regression coverage exercises the proxy, the worker's secret gate, and dispatch
acknowledgements. A production check must confirm delivery to the paired chat;
HTTP 202 alone proves acceptance, not message delivery.
