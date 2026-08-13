/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const privateHeaders = [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [
      { source: '/review/squad-invite', headers: privateHeaders },
      { source: '/dev/squad-invite-preview', headers: privateHeaders },
      { source: '/squad-invite/access', headers: privateHeaders },
    ];
  },
  async redirects() {
    return [
      {
        source: '/builder.html',
        destination: '/builder',
        permanent: false,
      },
      {
        // /pricing is a leftover page from the generic AI-custom-merch
        // product line (USD, "printed and shipped from the US") — not
        // linked anywhere in the current UK grassroots-football site and
        // inconsistent with its real GBP pricing. The homepage's own
        // #pricing section is the single source of truth; redirect rather
        // than maintain pricing copy in two places.
        source: '/pricing',
        destination: '/#pricing',
        permanent: false,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // @imgly/background-removal ships both web and node ONNX runtimes. On
    // client builds, alias the node-specific files to `false` so webpack
    // doesn't try to bundle them (they aren't compatible with Terser, see
    // ort.node.min.mjs which uses top-level `import` outside a module).
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node$': false,
        sharp$: false,
      };
    }
    // The library uses .mjs files; make sure they're treated as ESM by webpack.
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false },
    });
    return config;
  },
};

export default nextConfig;
