/** @type {import('next').NextConfig} */
const nextConfig = {
	// node:sqlite is a Node 22+ built-in; onnxruntime-node and sharp ship native
	// bindings — none of these should be bundled by webpack for the server build.
	webpack: (config, { isServer }) => {
		if (isServer) {
			config.externals = [
				...(config.externals || []),
				"node:sqlite",
				"onnxruntime-node",
				"sharp",
				"@huggingface/transformers",
			];
		}
		return config;
	},
};

export default nextConfig;
