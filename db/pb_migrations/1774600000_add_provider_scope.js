/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Add scope field to providers collection
  const providers = app.findCollectionByNameOrId("pbc_2249077391")
  providers.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1579384327",
    "max": 0,
    "min": 0,
    "name": "scope",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  app.save(providers)

  // Backfill scope for existing providers
  const scopeByType = { local: "public", sonos: "shared", youtube: "personal", spotify: "personal", soundcloud: "personal", bandcamp: "personal" }
  const existingProviders = app.findRecordsByFilter("providers", "scope = '' || scope = null", "", 0, 0)
  for (const provider of existingProviders) {
    const scope = scopeByType[provider.get("type")]
    if (scope) {
      provider.set("scope", scope)
      app.save(provider)
    }
  }

  // Update tracks listRule to allow public-scope providers
  const tracks = app.findCollectionByNameOrId("pbc_327047008")
  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  provider.scope = \"public\"\n  ||\n  provider.id ?= @collection.provider_grants.provider && @request.auth.id ?= @collection.provider_grants.user\n  ||\n  provider.id ?= @collection.connections.provider && @request.auth.id ?= @collection.connections.user\n)"
  }, tracks)
  return app.save(tracks)
}, (app) => {
  // Remove scope field from providers
  const providers = app.findCollectionByNameOrId("pbc_2249077391")
  providers.fields.removeById("text1579384327")
  app.save(providers)

  // Revert tracks listRule
  const tracks = app.findCollectionByNameOrId("pbc_327047008")
  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  provider.id ?= @collection.provider_grants.provider && @request.auth.id ?= @collection.provider_grants.user\n  ||\n  provider.id ?= @collection.connections.provider && @request.auth.id ?= @collection.connections.user\n)"
  }, tracks)
  return app.save(tracks)
})
