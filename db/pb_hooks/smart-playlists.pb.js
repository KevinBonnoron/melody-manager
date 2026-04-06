/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
  const userId = e.record.getString('user');
  if (!userId) {
    return;
  }

  const serverUrl = $os.getenv('SERVER_URL') || 'http://localhost:3000';

  try {
    $http.send({
      url: serverUrl + '/api/internal/playlists/refresh',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
      timeout: 5,
    });
  } catch (err) {
    console.log('[smart-playlists] Failed to refresh: ' + err);
  }

  e.next();
}, 'track_plays', 'track_likes');
