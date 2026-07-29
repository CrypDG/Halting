module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 runs its animations as worklets — this plugin compiles them.
    // Must stay last in the plugin list.
    plugins: ['react-native-worklets/plugin'],
  };
};
