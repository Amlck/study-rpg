export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
}
