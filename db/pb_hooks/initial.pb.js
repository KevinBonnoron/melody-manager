/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
  e.next();

  const count = e.app.countRecords('_superusers');
  if (count === 0) {
    const collection = e.app.findCollectionByNameOrId('_superusers');
    const record = new Record(collection);
    const email = $os.getenv('PB_SUPERUSER_EMAIL');
    const password = $os.getenv('PB_SUPERUSER_PASSWORD');
    if (!email || !password) {
      throw new Error('PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be set');
    }

    record.setEmail(email);
    record.setPassword(password);
    e.app.save(record);
    console.log('Superuser created with email: ' + email);
  }
});

onRecordCreate((e) => {
  const isFirstUser = e.app.countRecords('users') === 0;
  if (!isFirstUser && $os.getenv('REGISTRATION_DISABLED') === 'true') {
    throw new ForbiddenError('Registration is disabled');
  }

  e.record.set('role', isFirstUser ? 'admin' : 'user');
  e.next();
}, 'users');
