/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Gate 1 residual pass — route-level mitigation for GHSA-3x4c-7xq6-9pq8
    // (unbounded next/image disk-cache growth) and GHSA-h64f-5h5j-jqjh (DoS
    // in the Image Optimization API), both unresolved on Next 14.2.35
    // without a major-version bump this pass explicitly doesn't perform.
    // /_next/image is a public, unauthenticated endpoint whenever
    // next/image is used ANYWHERE in the app (currently 2 spots:
    // src/app/HomeEffects.tsx on the real homepage, and the Squad Invite
    // dev-preview harness), regardless of whether those specific images
    // are local or remote — an attacker can still hit it directly with
    // arbitrary width/quality query params. Disabling the optimizer
    // entirely removes that endpoint's attack surface at the cost of
    // serving those two images unresized/unconverted, which this app
    // already does everywhere else (see the many @next/next/no-img-element
    // lint warnings — plain <img> is already the dominant pattern here).
    unoptimized: true,
  },
  async headers() {
    // Baseline browser security headers for every route. Listed first so
    // the more specific entries below (which repeat Referrer-Policy with a
    // stricter 'no-referrer' for a handful of private preview/access paths)
    // apply afterwards and win for those exact paths — Next.js applies
    // matching header sets in array order, last write wins per key.
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    const privateHeaders = [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [
      { source: '/:path*', headers: securityHeaders },
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
