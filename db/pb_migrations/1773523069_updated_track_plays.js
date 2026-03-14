/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2967641492")

  // update collection data
  unmarshal({
    "updateRule": null
  }, collection)

  // remove field
  collection.fields.removeById("bool_completed")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "bool989355118",
    "name": "completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2967641492")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.id != '' && user = @request.auth.id"
  }, collection)

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "bool_completed",
    "name": "completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // remove field
  collection.fields.removeById("bool989355118")

  return app.save(collection)
})
