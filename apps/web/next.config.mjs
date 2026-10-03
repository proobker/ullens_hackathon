export default {
  transpilePackages: ['@pran-rekha/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:4100/api/:path*' }];
  }
};
