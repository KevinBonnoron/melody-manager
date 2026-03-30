/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2249077391")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || owner = @request.auth.id)",
    "deleteRule": "owner = @request.auth.id || (@request.auth.role = \"admin\" && owner = \"\")",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_KLynxcnTgp` ON `providers` (\n  `type`,\n  `owner`\n)"
    ],
    "listRule": "@request.auth.id != \"\" && (owner = \"\" || owner = @request.auth.id || (@collection.provider_grants.provider ?= id && @collection.provider_grants.user ?= @request.auth.id))",
    "updateRule": "owner = @request.auth.id || (@request.auth.role = \"admin\" && owner = \"\")",
    "viewRule": "@request.auth.id != \"\" && (owner = \"\" || owner = @request.auth.id || (@collection.provider_grants.provider ?= id && @collection.provider_grants.user ?= @request.auth.id))"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2249077391")

  // update collection data
  unmarshal({
    "createRule": "",
    "deleteRule": "",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_KLynxcnTgp` ON `providers` (`type`)"
    ],
    "listRule": "",
    "updateRule": "",
    "viewRule": ""
  }, collection)

  return app.save(collection)
})
