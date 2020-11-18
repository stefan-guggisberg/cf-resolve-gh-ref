# cf-resolve-gh-ref
A Cloudflare Worker that resolves a reference (a branch or tag name) of a GitHub repository to the SHA-1 of the corresponding commit.

## Usage

```
curl "https://gh-resolve-ref.<CF User>.workers.dev?owner=<gh owner/org>&repo=<gh repo>&ref=<branch/tag name>"
```
e.g.
```
curl "https://gh-resolve-ref.rockerduck.workers.dev?owner=adobe&repo=helix-fetch&ref=main"
```

## To deploy

* Make sure the environment variables `CF_ACCOUNT_ID` and `CF_API_TOKEN` are set.
* Run `wrangler publish`