package routes

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func shareGone(e *core.RequestEvent, reason string) error {
	if !strings.Contains(e.Request.Header.Get("Accept"), "text/html") {
		return e.NotFoundError("invalid share link", nil)
	}

	title, message := "Lien révoqué", "Ce lien de partage a été supprimé par la personne qui l'a créé."
	if reason == "expired" {
		title, message = "Lien expiré", "Ce lien de partage avait une date de fin, et elle est passée."
	}

	e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
	e.Response.WriteHeader(http.StatusNotFound)
	_, err := fmt.Fprintf(e.Response, sharePage, title, title, message)
	return err
}

const sharePage = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#08060f; color:#e7e4f1;
         font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding:24px }
  main { max-width:26rem; text-align:center }
  h1 { font-size:1.35rem; margin:0 0 .5rem }
  p { margin:0; color:#a09cb4 }
  .mark { width:44px; height:44px; margin:0 auto 20px; border-radius:12px; background:oklch(0.58 0.24 290);
          display:grid; place-items:center; color:#fff; font-weight:600 }
</style></head>
<body><main><div class="mark">♪</div><h1>%s</h1><p>%s</p></main></body></html>
`
