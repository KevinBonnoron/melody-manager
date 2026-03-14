/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('track_plays');

    // Remove the unique index on (user, track)
    collection.indexes = [];

    // Remove the count field
    collection.fields.removeById('number_count');

    // Remove update rule (no updates needed, each play is a new record)
    collection.updateRule = null;

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('track_plays');

    // Restore unique index
    collection.indexes = ['CREATE UNIQUE INDEX `idx_track_plays_user_track` ON `track_plays` (`user`, `track`)'];

    // Restore count field
    collection.fields.addAt(
      collection.fields.length,
      new Field({
        hidden: false,
        id: 'number_count',
        max: null,
        min: 0,
        name: 'count',
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: 'number',
      }),
    );

    // Restore update rule
    collection.updateRule = "@request.auth.id != '' && user = @request.auth.id";

    app.save(collection);
  },
);
