module.exports = {
  apps: [
    {
      name: 'contentos',
      script: 'npm',
      args: 'start',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'worker',
      script: 'npx',
      args: 'tsx worker.ts',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
