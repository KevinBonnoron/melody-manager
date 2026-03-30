/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3287366145")

  // remove field
  collection.fields.removeById("text945676439")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "file_cover",
    "maxSelect": 1,
    "maxSize": 10485760,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/gif",
      "image/webp"
    ],
    "name": "cover",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [
      "500x500",
      "200x200"
    ],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3287366145")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text945676439",
    "max": 0,
    "min": 0,
    "name": "coverUrl",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("file_cover")

  return app.save(collection)
})
