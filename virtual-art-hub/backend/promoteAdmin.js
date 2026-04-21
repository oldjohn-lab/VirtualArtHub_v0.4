const db = require('./models');

const username = process.argv[2];

if (!username) {
  console.error('username is required');
  process.exit(1);
}

async function run() {
  try {
    const user = await db.User.findOne({ where: { username } });
    if (!user) {
      console.error('user not found');
      process.exit(1);
    }
    user.role = 'admin';
    await user.save();
    console.log(`OK: ${username} -> admin`);
    process.exit(0);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

run();

