/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_327047008")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\" && (\n  provider.id ?= @collection.provider_grants.provider && @request.auth.id ?= @collection.provider_grants.user\n  ||\n  provider.id ?= @collection.connections.provider && @request.auth.id ?= @collection.connections.user\n)"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_327047008")

  // update collection data
  unmarshal({
    "listRule": ""
  }, collection)

  return app.save(collection)
})
