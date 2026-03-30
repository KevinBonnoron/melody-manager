/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const scopeByType = { local: "public", sonos: "shared", youtube: "personal", spotify: "personal", soundcloud: "personal", bandcamp: "personal" }

  // Target providers without a scope (null or empty)
  const providers = app.findAllRecords("providers")
  for (const provider of providers) {
    const currentScope = provider.get("scope")
    if (!currentScope) {
      const scope = scopeByType[provider.get("type")]
      if (scope) {
        provider.set("scope", scope)
        app.save(provider)
      }
    }
  }
}, () => {})
