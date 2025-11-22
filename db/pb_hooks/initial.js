onBootstrap((e) => {
  e.next();

  const count = e.app.countRecords('_superusers');
  if (count === 0) {
    const collection = e.app.findCollectionByNameOrId('_superusers');
    const record = new Record(collection);
    const email = $os.getenv('PB_ADMIN_EMAIL') || 'admin@melody-manager.local';
    const password = $os.getenv('PB_ADMIN_PASSWORD') || 'changeme123';
    record.setEmail(email);
    record.setPassword(password);
    e.app.save(record);
    console.log('Superuser created with email: ' + email);
  }
});

onRecordCreate((e) => {
  const count = e.app.countRecords('users');
  e.record.set('role', count === 0 ? 'admin' : 'user');
  e.next();
}, 'users');
