/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Remove user field from playlists
  const playlists = app.findCollectionByNameOrId("pbc_playlists")
  playlists.fields.removeById("relation4154657856")
  app.save(playlists)

  // Create playlist_likes collection
  const collection = new Collection({
    createRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id",
    fields: [
      {
        autogeneratePattern: '[a-z0-9]{15}',
        hidden: false,
        id: 'text3208210256',
        max: 15,
        min: 15,
        name: 'id',
        pattern: '^[a-z0-9]+$',
        presentable: false,
        primaryKey: true,
        required: true,
        system: true,
        type: 'text',
      },
      {
        cascadeDelete: true,
        collectionId: '_pb_users_auth_',
        hidden: false,
        id: 'relation2375276105',
        maxSelect: 1,
        minSelect: 0,
        name: 'user',
        presentable: false,
        required: true,
        system: false,
        type: 'relation',
      },
      {
        cascadeDelete: true,
        collectionId: 'pbc_playlists',
        hidden: false,
        id: 'relation1847491726',
        maxSelect: 1,
        minSelect: 0,
        name: 'playlist',
        presentable: false,
        required: true,
        system: false,
        type: 'relation',
      },
      {
        hidden: false,
        id: 'autodate2990389176',
        name: 'created',
        onCreate: true,
        onUpdate: false,
        presentable: false,
        system: false,
        type: 'autodate',
      },
      {
        hidden: false,
        id: 'autodate3332085495',
        name: 'updated',
        onCreate: true,
        onUpdate: true,
        presentable: false,
        system: false,
        type: 'autodate',
      },
    ],
    id: 'pbc_playlist_likes',
    indexes: ['CREATE UNIQUE INDEX `idx_playlist_likes_user_playlist` ON `playlist_likes` (\n  `user`,\n  `playlist`\n)'],
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    name: 'playlist_likes',
    system: false,
    type: 'base',
    updateRule: null,
    viewRule: "@request.auth.id != '' && user = @request.auth.id",
  });

  return app.save(collection);
}, (app) => {
  // Delete playlist_likes collection
  const collection = app.findCollectionByNameOrId("pbc_playlist_likes");
  app.delete(collection);

  // Restore user field on playlists
  const playlists = app.findCollectionByNameOrId("pbc_playlists")
  playlists.fields.addAt(7, new Field({
    cascadeDelete: false,
    collectionId: '_pb_users_auth_',
    hidden: false,
    id: 'relation4154657856',
    maxSelect: 1,
    minSelect: 0,
    name: 'user',
    presentable: false,
    required: true,
    system: false,
    type: 'relation',
  }))

  return app.save(playlists)
});
