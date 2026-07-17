/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { webpack }) => {
    // The Coinbase Smart Wallet connector (pulled in transitively via wagmi/RainbowKit)
    // references an experimental "x402" payment package whose submodules aren't
    // fully installed and aren't used by this app. Tell webpack to skip all of
    // them instead of failing the build trying to resolve each one.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\//,
      })
    );
    return config;
  },
};

export default nextConfig;