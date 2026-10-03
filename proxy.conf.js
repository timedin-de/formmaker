export default [
  {
    context: ['/api'],
    target: process.env.API_URL ?? 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
  },
];
