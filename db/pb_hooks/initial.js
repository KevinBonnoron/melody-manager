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

onRecordCreateRequest((e) => {
  const count = e.app.countRecords('users');
  const isFirstUser = count === 0;

  if (!isFirstUser && $os.getenv('REGISTRATION_DISABLED') === 'true') {
    throw new ForbiddenError('Registration is disabled');
  }

  e.record.set('role', isFirstUser ? 'admin' : 'user');
  e.next();
}, 'users');
