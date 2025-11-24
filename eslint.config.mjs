import nextConfig from 'eslint-config-next'

const patchedConfig = nextConfig.map((config) => {
	if (config?.name === "next") {
		return {
			...config,
			rules: {
				...config.rules,
				"react-hooks/set-state-in-effect": "off",
			},
		}
	}
	if (Array.isArray(config?.ignores)) {
		return {
			...config,
			ignores: [...config.ignores, "python-services/**"],
		}
	}
	return config
})

export default patchedConfig
