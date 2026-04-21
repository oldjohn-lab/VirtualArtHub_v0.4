/* 生产构建在 Docker/低内存环境易 OOM：关闭 Terser / CSS 压缩的并行，降低峰值内存（略增构建时长） */
module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production' && webpackConfig.optimization?.minimizer) {
        webpackConfig.optimization.minimizer.forEach((plugin) => {
          const ctor = plugin?.constructor?.name;
          if ((ctor === 'TerserPlugin' || ctor === 'CssMinimizerPlugin') && plugin.options) {
            plugin.options.parallel = false;
          }
        });
      }
      return webpackConfig;
    },
  },
};
