import { getDb, disconnectDb } from './index.js';

async function main() {
  const db = getDb();

  // Create default admin user
  const user = await db.user.upsert({
    where: { email: 'admin@kindle-assist.local' },
    update: {},
    create: {
      email: 'admin@kindle-assist.local',
    },
  });

  console.log('Created admin user:', user.id);

  // Create some default tags
  const defaultTags = ['tech', 'news', 'reading', 'favorites'];
  for (const tagName of defaultTags) {
    await db.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
  }

  console.log('Created default tags:', defaultTags.join(', '));
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
