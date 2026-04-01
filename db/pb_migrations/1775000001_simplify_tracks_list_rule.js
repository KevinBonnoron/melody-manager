/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const tracks = app.findCollectionByNameOrId("pbc_327047008")
  unmarshal({
    "listRule": "@request.auth.id != \"\""
  }, tracks)
  return app.save(tracks)
}, (app) => {
  const tracks = app.findCollectionByNameOrId("pbc_327047008")
  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  provider.id ?= @collection.provider_grants.provider && @request.auth.id ?= @collection.provider_grants.user\n  ||\n  provider.id ?= @collection.connections.provider && @request.auth.id ?= @collection.connections.user\n)"
  }, tracks)
  return app.save(tracks)
})
