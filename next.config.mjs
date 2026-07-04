/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // SharedArrayBuffer is required by @imgly/background-removal's WASM runtime.
  // COOP + COEP headers enable it in modern browsers.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',  value: 'require-corp' },
        ],
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
