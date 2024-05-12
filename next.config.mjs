/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.ctfassets.net', 'downloads.ctfassets.net']
  },
  typescript: {
    ignoreBuildErrors: true
  }
};

export default nextConfig;
