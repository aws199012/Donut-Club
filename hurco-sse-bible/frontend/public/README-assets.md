# Local-only assets

This folder is served as-is at the site root by Vite (e.g. `public/foo.png` → `/foo.png`).

## `hurco-logo-red.png`

The background watermark on the main content area references `/hurco-logo-red.png`. That
file is **not** committed to this repo — it's a real Hurco brand asset, and this repo is
public. It's gitignored on purpose.

To see the watermark locally, save the Hurco logo (the dark/red gradient version) as:

```
hurco-sse-bible/frontend/public/hurco-logo-red.png
```

If the file isn't present, the page still works fine — you just won't see the watermark
(the dark background color still renders normally).
