import mongoose from 'mongoose';
const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27017', {
  serverSelectionTimeoutMS: 5000,
});
try {
  await client.connect();
  const hello = await client.db('admin').command({ hello: 1 });
  const build = await client.db('admin').command({ buildInfo: 1 });
  console.log(
    JSON.stringify(
      {
        address: '127.0.0.1:27017',
        version: build.version,
        topology: hello.setName
          ? 'replica set'
          : hello.msg === 'isdbgrid'
            ? 'mongos'
            : 'standalone',
        replicaSet: hello.setName ?? null,
        writable: hello.isWritablePrimary === true,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
